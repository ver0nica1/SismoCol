"""Balances municipales transcritos de reportes periodísticos identificables."""
CITY_REPORTS = {
 'https://www.infobae.com/colombia/2026/08/12/nuevo-temblor-en-choco-se-sintio-con-fuerza-en-cali-y-genero-nuevas-afectaciones-en-la-infraestructura/?outputType=amp-type': {'Quibdó':(9,119,4),'Cali':(74,1008,230),'Manizales':(6,182,None),'Pereira':(83,279,45),'Armenia':(0,174,None)},
 'https://www.infobae.com/colombia/2026/08/18/estos-son-los-municipios-y-ciudades-mas-afectados-por-el-terremoto-del-10-de-agosto-en-colombia-segun-el-ultimo-reporte-de-las-autoridades/?outputType=amp-type': {'Cali':(96,1224,111),'Pereira':(93,259,260),'Manizales':(6,119,None),'Quibdó':(9,119,0),'Armenia':(0,174,None)},
 'https://www.infobae.com/colombia/2026/08/19/terremoto-en-colombia-nuevo-informe-de-victimas-ajusto-el-numero-de-heridos/': {'Cali':(141,1569,47),'Pereira':(99,259,132),'Quibdó':(8,155,0),'Manizales':(6,211,None),'Armenia':(1,134,None)},
}
def populate_city_impacts(conn):
    inserted=0
    for url,cities in CITY_REPORTS.items():
        article=conn.execute('SELECT id,published_at FROM news_articles WHERE url=?',(url,)).fetchone()
        if not article: continue
        report=conn.execute('SELECT id FROM impact_reports WHERE article_id=? ORDER BY id LIMIT 1',(article['id'],)).fetchone()
        if not report: continue
        for name,(deceased,injured,missing) in cities.items():
            city=conn.execute('SELECT id FROM cities WHERE name=?',(name,)).fetchone()
            if not city or conn.execute('SELECT 1 FROM city_impacts WHERE city_id=? AND report_id=?',(city['id'],report['id'])).fetchone(): continue
            conn.execute('INSERT INTO city_impacts(city_id,report_id,deceased,injured,missing) VALUES(?,?,?,?,?)',(city['id'],report['id'],deceased,injured,missing)); inserted+=1
    conn.commit(); return inserted
