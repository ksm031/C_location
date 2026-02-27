import os
import io
import zipfile
from datetime import datetime
from functools import wraps

import psycopg2
from flask import (Flask, request, jsonify, render_template,
                   session, redirect, url_for, send_file)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-change-me')

APP_PASSWORD = os.environ.get('APP_PASSWORD', '')
DATABASE_URL = os.environ.get('DATABASE_URL', '')


# ── DB 연결 ───────────────────────────────────────────────────────────────────

def get_db():
    if not DATABASE_URL:
        raise RuntimeError('DATABASE_URL 환경변수가 설정되지 않았습니다.')
    return psycopg2.connect(DATABASE_URL)


# ── 로그인 ────────────────────────────────────────────────────────────────────

def require_login(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return wrapper


@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        password = request.form.get('password', '')
        if APP_PASSWORD and password == APP_PASSWORD:
            session['logged_in'] = True
            return redirect(url_for('index'))
        error = '비밀번호가 틀렸습니다.'
    return render_template('login.html', error=error)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/')
@require_login
def index():
    return render_template('index.html')


@app.route('/save', methods=['POST'])
@require_login
def save():
    body = request.get_json()
    filename = body.get('filename', '').strip()
    text = body.get('text', '')

    if not filename:
        filename = datetime.now().strftime('paste_%Y%m%d_%H%M%S')
    if not filename.endswith('.txt'):
        filename += '.txt'
    filename = os.path.basename(filename)

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO pastes (filename, content)
            VALUES (%s, %s)
            ON CONFLICT (filename) DO UPDATE
              SET content = EXCLUDED.content,
                  updated_at = NOW()
        """, (filename, text))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    return jsonify({'status': 'ok', 'saved_as': filename})


@app.route('/files')
@require_login
def list_files():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT filename FROM pastes ORDER BY filename")
        files = [row[0] for row in cur.fetchall()]
        cur.close()
        conn.close()
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/files/<filename>')
@require_login
def get_file(filename):
    filename = os.path.basename(filename)
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT content FROM pastes WHERE filename = %s", (filename,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return jsonify({'error': 'not found'}), 404
        return jsonify({'filename': filename, 'content': row[0]})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/export')
@require_login
def export_zip():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT filename, content FROM pastes ORDER BY filename")
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for filename, content in rows:
            zf.writestr(filename, content)
    buf.seek(0)
    return send_file(buf, mimetype='application/zip',
                     as_attachment=True, download_name='pastes.zip')


if __name__ == '__main__':
    if not DATABASE_URL:
        print('ERROR: DATABASE_URL 환경변수를 설정하세요.')
        print('Supabase → Settings → Database → Connection string (Transaction mode)')
        raise SystemExit(1)
    app.run(debug=False, port=5000)
