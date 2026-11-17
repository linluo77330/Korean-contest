#!/usr/bin/env python3
"""CloudBridge local-only launcher. Standard library; no package installation."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / '.local-run'
PORT = 8787
URL = f'http://127.0.0.1:{PORT}'
PID_FILE = RUNTIME / 'server.pid'
LOG_FILE = RUNTIME / 'server.log'


def health():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(URL + '/__cloudbridge_health', timeout=1) as response:
            data = json.load(response)
        return data if data.get('service') == 'CloudBridge-local' else None
    except (OSError, ValueError, urllib.error.URLError):
        return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def do_GET(self):
        if self.path == '/__cloudbridge_health':
            payload = json.dumps({'service': 'CloudBridge-local', 'pid': os.getpid()}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, 'Not found')
        return None


def serve():
    RUNTIME.mkdir(exist_ok=True)
    try:
        server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError as error:
        print(f'本地服务启动失败：{error}', file=sys.stderr)
        return 1
    PID_FILE.write_text(str(os.getpid()))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if PID_FILE.exists() and PID_FILE.read_text().strip() == str(os.getpid()):
            PID_FILE.unlink()
    return 0


def start():
    if health():
        print('CloudBridge本地服务已在运行：' + URL)
        return 0
    if not (ROOT / 'dist' / 'index.html').is_file():
        print('未找到dist/index.html，请保留完整项目目录。', file=sys.stderr)
        return 1
    RUNTIME.mkdir(exist_ok=True)
    with LOG_FILE.open('ab') as log:
        process = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), 'serve'],
            cwd=str(ROOT), stdin=subprocess.DEVNULL, stdout=log, stderr=log,
            start_new_session=True,
        )
    for _ in range(25):
        if health():
            print('CloudBridge本地部署已启动：' + URL)
            print('仅本机可访问；无需ChatGPT登录；关闭浏览器不会停止服务。')
            print('停止方式：双击“停止本地服务.command”。')
            return 0
        if process.poll() is not None:
            break
        time.sleep(.15)
    print('服务未能启动，请检查8787端口及.local-run/server.log。', file=sys.stderr)
    return 1


def stop():
    current = health()
    if not current:
        print('CloudBridge本地服务当前未运行。')
        return 0
    if not PID_FILE.exists() or PID_FILE.read_text().strip() != str(current['pid']):
        print('进程记录不一致，未停止任何进程。', file=sys.stderr)
        return 1
    os.kill(current['pid'], signal.SIGTERM)
    for _ in range(20):
        if not health():
            PID_FILE.unlink(missing_ok=True)
            print('CloudBridge本地服务已停止。')
            return 0
        time.sleep(.1)
    print('已发送停止信号，请稍后检查。')
    return 0


def main():
    parser = argparse.ArgumentParser(description='CloudBridge本地部署，不依赖云端登录。')
    parser.add_argument('action', choices=['start', 'stop', 'status', 'serve'], nargs='?', default='start')
    action = parser.parse_args().action
    if action == 'start':
        return start()
    if action == 'stop':
        return stop()
    if action == 'serve':
        return serve()
    current = health()
    print(json.dumps({'running': bool(current), 'url': URL, 'pid': current.get('pid') if current else None}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
