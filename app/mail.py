"""Email delivery using credentials from environment variables."""

import logging
import os
import smtplib
import ssl
from collections.abc import Callable
from email.message import EmailMessage

from .db import db, settings

logger = logging.getLogger(__name__)


def ready() -> bool:
    return all(
        os.getenv(key)
        for key in ("SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM")
    )


def send(subject: str, body: str, to: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = to
    message.set_content(body)

    with smtplib.SMTP(
        os.getenv("SMTP_HOST", "smtp.gmail.com"),
        int(os.getenv("SMTP_PORT", "587")),
        timeout=30,
    ) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        smtp.login(
            os.environ["SMTP_USER"],
            os.environ["SMTP_PASSWORD"],
        )
        smtp.send_message(message)


def deliver(checkpoint: Callable[[], None] | None = None) -> None:
    # GitHub Actions supplies the recipient without saving it in the database.
    recipient = os.getenv("ALERT_EMAIL", "").strip()

    if not recipient:
        config = settings()
        if not config.get("email_enabled"):
            return
        recipient = config.get("email", "").strip()

    if not recipient:
        return

    if not ready():
        raise RuntimeError("Missing SMTP credentials in environment variables.")

    # A previous interrupted attempt may already have reached Gmail.
    with db() as connection:
        connection.execute(
            """
            UPDATE outbox
            SET state = 'uncertain',
                error = 'Interrupted delivery; check mailbox before retrying.'
            WHERE state = 'sending'
            """
        )
        rows = connection.execute(
            """
            SELECT o.id AS delivery_id, j.*, s.name AS company
            FROM outbox o
            JOIN jobs j ON j.id = o.job_id
            JOIN sources s ON s.id = j.source_id
            WHERE o.state = 'pending'
            ORDER BY o.id
            LIMIT 10
            """
        ).fetchall()

    if checkpoint:
        checkpoint()

    logger.info("Pending email alerts in this batch: %s", len(rows))

    for job in rows:
        with db() as connection:
            claimed = connection.execute(
                """
                UPDATE outbox SET state = 'sending', error = NULL
                WHERE id = ? AND state = 'pending'
                """,
                (job["delivery_id"],),
            ).rowcount

        if not claimed:
            continue

        # On Actions, persist this state remotely BEFORE sending.
        # If saving fails, stop without sending the message.
        if checkpoint:
            checkpoint()

        subject = f"New job · {job['company']} · {job['title']}"
        subject = " ".join(subject.splitlines())

        body = (
            "🚀 NEW JOB DETECTED\n\n"
            f"Company: {job['company']}\n"
            f"Position: {job['title']}\n"
            f"Location: {job['location'] or 'Not provided'}\n"
            f"Employment Type: {job['employment'] or 'Not provided'}\n"
            f"Published: {job['published'] or 'Not provided'}\n"
            f"Detected (UTC): {job['detected']}\n\n"
            f"Application Link:\n{job['url']}\n\n"
            "Source: Official Careers Website\n"
        )

        try:
            send(subject, body, recipient)
        except (OSError, smtplib.SMTPException):
            with db() as connection:
                connection.execute(
                    """
                    UPDATE outbox SET state = 'uncertain', error = ?
                    WHERE id = ?
                    """,
                    (
                        "Delivery not confirmed; check mailbox before retrying.",
                        job["delivery_id"],
                    ),
                )
            if checkpoint:
                checkpoint()
            raise RuntimeError(
                "Email delivery was not confirmed. Automatic retry disabled "
                "for this alert to avoid duplicates."
            ) from None
        else:
            with db() as connection:
                connection.execute(
                    """
                    UPDATE outbox SET state = 'sent', error = NULL
                    WHERE id = ?
                    """,
                    (job["delivery_id"],),
                )
            if checkpoint:
                checkpoint()

            logger.info("Email alert sent: delivery_id=%s", job["delivery_id"])
