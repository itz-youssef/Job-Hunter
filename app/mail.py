"""SMTP credentials are server environment variables, never browser settings."""
import os,smtplib,ssl,socket
from email.message import EmailMessage
from .db import db,settings,now

def ready():return all(os.getenv(k) for k in ['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'])
def send(subject,body,to):
    msg=EmailMessage();msg['Subject']=subject;msg['From']=os.environ['SMTP_FROM'];msg['To']=to;msg.set_content(body)
    with smtplib.SMTP(os.environ['SMTP_HOST'],int(os.getenv('SMTP_PORT','587')),timeout=25) as smtp:
        smtp.ehlo();smtp.starttls(context=ssl.create_default_context());smtp.ehlo();smtp.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD']);smtp.send_message(msg)

def deliver():
    cfg=settings()
    if not cfg['email_enabled'] or not cfg['email'] or not ready():return
    with db() as c:
        # Any interrupted send is uncertain. Do not retry and risk duplicates.
        c.execute("UPDATE outbox SET state='uncertain',error='Worker stopped during delivery; verify mailbox before retrying.' WHERE state='sending'")
        rows=c.execute("SELECT o.id AS delivery_id,j.*,s.name AS company FROM outbox o JOIN jobs j ON j.id=o.job_id JOIN sources s ON s.id=j.source_id WHERE o.state='pending' ORDER BY o.id LIMIT 10").fetchall()
    for j in rows:
        with db() as c:c.execute("UPDATE outbox SET state='sending' WHERE id=?",(j['delivery_id'],))
        try:
            send('New job detected · '+j['company']+' · '+j['title'],f"NEW JOB DETECTED\n\nCompany: {j['company']}\nPosition: {j['title']}\nLocation: {j['location']}\nEmployment: {j['employment']}\nPublished: {j['published'] or 'Not provided'}\nDetected (UTC): {j['detected']}\n\nApply: {j['url']}\n\nSource: Official careers website\n",cfg['email'])
            state,error='sent',None
        except smtplib.SMTPResponseException as e:state,error='failed',f'SMTP rejected delivery ({e.smtp_code}); resolve settings or limits before retry.'
        except (OSError,smtplib.SMTPException) as e:state,error='uncertain','Delivery outcome uncertain; verify mailbox before retry.'
        with db() as c:c.execute('UPDATE outbox SET state=?,error=? WHERE id=?',(state,error,j['delivery_id']))
