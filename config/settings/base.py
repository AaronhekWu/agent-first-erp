"""
Django 基础配置
所有环境共享的设置项
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-key-change-me")

DEBUG = False

ALLOWED_HOSTS: list[str] = []

# ============================================================
# 应用注册
# ============================================================
INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # 项目应用（不使用 Django ORM，仅注册以便 URL 路由和模板发现）
    "apps.core",
    "apps.accounts",
    "apps.students",
    "apps.courses",
    "apps.followups",
    "apps.agents",
    "apps.audits",
    "apps.tools",
    "apps.finance",
    "apps.promotions",
]

# ============================================================
# 中间件
# ============================================================
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

# ============================================================
# 模板
# ============================================================
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ============================================================
# 数据库：不使用 Django ORM，所有数据通过 Supabase 客户端访问
# 保留 default 数据库用于 Django 内置功能（session, auth 等）
# ============================================================
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# ============================================================
# Supabase 配置
# ============================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ============================================================
# 国际化
# ============================================================
LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True

# ============================================================
# 静态文件
# ============================================================
STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
