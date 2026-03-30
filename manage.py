#!/usr/bin/env python
"""Django 管理命令入口"""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "无法导入 Django。请确认已安装并在 PYTHONPATH 环境变量中可用。"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
