"""Publish a safe, masked view of GitHub Actions email configuration.

Never write SMTP_PASSWORD, GITHUB_TOKEN or the full ALERT_EMAIL to dist.
This is intended to run after the custom careers scan and before git commit.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path


def mask_email(value: str) -> str:
    value = value.strip()
    if value.count('@') != 1:
        return 'Not configured'
    name, domain = value.rsplit('@', 1)
    parts = domain.split('.')
    if not name or len(parts) < 2 or not all(parts):
        return 'Not configured'
    local = name[:2] + '***' if len(name) > 2 else name[:1] + '***'
    site = parts[0][:1] + '***'
    suffix = '.'.join(parts[1:])
    return f'{local}@{site}.{suffix}'


def main():
    required = ('ALERT_EMAIL', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM')
    present = {key: bool(os.getenv(key, '').strip()) for key in required}
    data = {
        'recipient_masked': mask_email(os.getenv('ALERT_EMAIL', '')),
        'configured': all(present.values()),
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'delivery_tested': False,
    }
    output = Path('dist/notification-status.json')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    print('Published masked notification status (no secret values).')


if __name__ == '__main__':
    main()
