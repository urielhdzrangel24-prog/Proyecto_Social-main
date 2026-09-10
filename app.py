"""Servidor mínimo de SynergAI para el prototipo.

Incluye SQLite, usuarios de demostración y sesiones temporales en memoria.
No pretende sustituir un backend de producción.
"""
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import secrets
import sqlite3
import time
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).parent
DB_PATH = ROOT / "synergai.db"
SESSIONS = {}
AUTH_ATTEMPTS = {}
MAX_BODY_SIZE = 16 * 1024


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${digest}"


def valid_password(password, stored):
    try:
        salt, expected = stored.split("$", 1)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
        return secrets.compare_digest(actual, expected)
    except ValueError:
        return False


def db_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with db_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('teacher', 'student', 'parent')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                subject TEXT NOT NULL,
                description TEXT DEFAULT '',
                join_code TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (teacher_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                instructions TEXT NOT NULL,
                objectives TEXT DEFAULT '',
                due_date TEXT,
                status TEXT NOT NULL DEFAULT 'draft',
                FOREIGN KEY (class_id) REFERENCES classes(id)
            );
            CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                answer TEXT NOT NULL DEFAULT '',
                submitted_at TEXT,
                teacher_grade REAL,
                FOREIGN KEY (task_id) REFERENCES tasks(id),
                FOREIGN KEY (student_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS ai_evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                submission_id INTEGER NOT NULL,
                objective_results TEXT NOT NULL DEFAULT '[]',
                suggested_grade REAL,
                feedback TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'suggested',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (submission_id) REFERENCES submissions(id)
            );
        """)
        demo_users = [
            ("Maestro demo", "maestro@demo.com", "maestro123", "teacher"),
            ("Estudiante demo", "estudiante@demo.com", "estudiante123", "student"),
            ("Padre demo", "padre@demo.com", "padre123", "parent"),
        ]
        for name, email, password, role in demo_users:
            connection.execute(
                "INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                (name, email, hash_password(password), role),
            )


def user_payload(user):
    return {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}


def valid_registration_password(password):
    return (len(password) >= 8 and any(c.isupper() for c in password)
            and any(c.islower() for c in password) and any(c.isdigit() for c in password))


def allowed_attempt(ip):
    now = time.time()
    attempts = [stamp for stamp in AUTH_ATTEMPTS.get(ip, []) if stamp > now - 60]
    if len(attempts) >= 8:
        AUTH_ATTEMPTS[ip] = attempts
        return False
    attempts.append(now)
    AUTH_ATTEMPTS[ip] = attempts
    return True


class AppHandler(SimpleHTTPRequestHandler):
    def log_message(self, format_string, *args):
        print(f"[{self.log_date_time_string}] {format_string % args}")

    def send_json(self, payload, status=200, extra_headers=None):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def request_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY_SIZE:
            raise ValueError("request too large")
        return json.loads(self.rfile.read(length) or b"{}")

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")
        super().end_headers()

    def session_user(self):
        jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
        session = jar.get("synergai_session")
        if not session:
            return None
        record = SESSIONS.get(session.value)
        if not record or record["expires"] < time.time():
            SESSIONS.pop(session.value, None)
            return None
        with db_connection() as connection:
            return connection.execute("SELECT * FROM users WHERE id = ?", (record["user_id"],)).fetchone()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/login":
            self.path = "/login.html"
        elif path == "/register":
            self.path = "/register.html"
        elif path == "/api/session":
            user = self.session_user()
            self.send_json({"authenticated": bool(user), "user": user_payload(user) if user else None})
            return
        elif path == "/api/health":
            self.send_json({"ok": True, "database": "sqlite"})
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/auth/login":
            if not allowed_attempt(self.client_address[0]):
                self.send_json({"error": "Demasiados intentos. Espera un minuto e inténtalo de nuevo."}, 429)
                return
            try:
                body = self.request_body()
            except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
                self.send_json({"error": "La solicitud no es válida."}, 400)
                return
            email = str(body.get("email", "")).strip().lower()
            password = str(body.get("password", ""))
            with db_connection() as connection:
                user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if not user or not valid_password(password, user["password_hash"]):
                self.send_json({"error": "Correo o contraseña incorrectos."}, 401)
                return
            token = secrets.token_urlsafe(32)
            SESSIONS[token] = {"user_id": user["id"], "expires": time.time() + 60 * 60 * 8}
            self.send_json(
                {"user": user_payload(user)},
                extra_headers={"Set-Cookie": f"synergai_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800"},
            )
            return
        if path == "/api/auth/register":
            if not allowed_attempt(self.client_address[0]):
                self.send_json({"error": "Demasiados intentos. Espera un minuto e inténtalo de nuevo."}, 429)
                return
            try:
                body = self.request_body()
            except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
                self.send_json({"error": "La solicitud no es válida."}, 400)
                return
            name = " ".join(str(body.get("name", "")).strip().split())
            email = str(body.get("email", "")).strip().lower()
            password = str(body.get("password", ""))
            role = str(body.get("role", "student")).strip().lower()
            if not 2 <= len(name) <= 80 or "@" not in email or len(email) > 160:
                self.send_json({"error": "Revisa tu nombre y correo electrónico."}, 400)
                return
            if role not in {"teacher", "student", "parent"}:
                self.send_json({"error": "El tipo de cuenta no es válido."}, 400)
                return
            if not valid_registration_password(password):
                self.send_json({"error": "La contraseña debe tener 8 caracteres, mayúscula, minúscula y número."}, 400)
                return
            try:
                with db_connection() as connection:
                    cursor = connection.execute(
                        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                        (name, email, hash_password(password), role),
                    )
                    user = connection.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
            except sqlite3.IntegrityError:
                self.send_json({"error": "No fue posible crear la cuenta con esos datos."}, 409)
                return
            token = secrets.token_urlsafe(32)
            SESSIONS[token] = {"user_id": user["id"], "expires": time.time() + 60 * 60 * 8}
            self.send_json({"user": user_payload(user)}, 201, {
                "Set-Cookie": f"synergai_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800"
            })
            return
        if path == "/api/auth/logout":
            jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
            session = jar.get("synergai_session")
            if session:
                SESSIONS.pop(session.value, None)
            self.send_json({"ok": True}, extra_headers={"Set-Cookie": "synergai_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"})
            return
        self.send_json({"error": "Ruta no encontrada."}, 404)


if __name__ == "__main__":
    initialize_database()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), AppHandler)
    print("SynergAI disponible en http://127.0.0.1:8000")
    print("Demo: maestro@demo.com / maestro123")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()
