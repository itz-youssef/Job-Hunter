import re

def relevance(job,config):
    title=job['title'].lower(); text=title+' '+job.get('description','').lower(); location=job.get('location','').lower()
    keywords=[x.strip().lower() for x in config['keywords'].split(',') if x.strip()]
    hits=[k for k in keywords if re.search(r'\b'+re.escape(k)+r'\b',text)]
    if not hits:return 0,['No technical match']
    reasons=['Skills: '+', '.join(hits[:5])]; score=3
    wanted=[x.strip() for x in config['locations'].lower().split(',') if x.strip()]
    if wanted and not any(x in location for x in wanted):return 0,['Location outside preferences or unknown']
    if wanted:score+=2; reasons.append('Preferred location')
    if re.search(r'\b(intern\w*|junior|graduate|entry.level|work experience|trainee)\b',title):score+=3; reasons.append('Early career')
    if re.search(r'\b(senior|lead|principal|director|manager)\b',title):score-=3; reasons.append('Senior role: lower priority')
    return score,reasons
