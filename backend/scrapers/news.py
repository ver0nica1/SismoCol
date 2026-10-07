from datetime import datetime, timezone
import requests
import re
from bs4 import BeautifulSoup
from backend.services.extraction import clean_text, extract_figures

def fetch_article(url, timeout=20):
    response = requests.get(url, timeout=timeout, headers={'User-Agent':'SismoCol/1.0 (research; contact project owner)'})
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    title = soup.find('h1') or soup.find('title')
    paragraphs = [clean_text(p.get_text(' ', strip=True)) for p in soup.select('article p, main p, p')]
    text = clean_text(' '.join(p for p in paragraphs if p))
    published = re.search(r'/((?:20)\d{2})/(\d{2})/(\d{2})/', url)
    published_at = '-'.join(published.groups()) if published else None
    return {'title': clean_text(title.get_text(' ', strip=True)) if title else '', 'url': url, 'published_at': published_at, 'relevant_text': text, 'figures': extract_figures(text), 'extracted_at': datetime.now(timezone.utc).isoformat()}

def save_article(conn, article, source_id):
    cur = conn.execute("INSERT OR IGNORE INTO news_articles(source_id,title,url,published_at,relevant_text,extracted_at) VALUES(?,?,?,?,?,?)", (source_id,article['title'],article['url'],article.get('published_at'),article['relevant_text'],article['extracted_at']))
    row = conn.execute('SELECT id FROM news_articles WHERE url=?',(article['url'],)).fetchone()
    if cur.rowcount == 0: return 0
    f = article['figures']; conn.execute("INSERT INTO impact_reports(article_id,source_id,balance_date,reported_at,deceased,injured,missing,rescued,affected,homes_affected,homes_destroyed) VALUES(?,?,?,?,?,?,?,?,?,?,?)", (row['id'],source_id,article.get('published_at'),article['extracted_at'],f['deceased'],f['injured'],f['missing'],f['rescued'],f['affected'],f['homes_affected'],f['homes_destroyed']))
    conn.commit(); return cur.rowcount
