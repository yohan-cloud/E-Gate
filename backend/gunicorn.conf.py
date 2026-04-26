import multiprocessing
import os


bind = f"{os.getenv('GUNICORN_HOST', '127.0.0.1')}:{os.getenv('PORT', '8000')}"
workers = max(2, multiprocessing.cpu_count() // 2)
threads = int(os.getenv("GUNICORN_THREADS", "2"))
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
capture_output = True
worker_tmp_dir = "/dev/shm"
