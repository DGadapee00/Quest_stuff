"""Fetch the documented public model ZIPs into ignored private build scratch.
No credentials, login, scraper bypass or runtime external requests are used.
"""
from pathlib import Path, PurePosixPath
import hashlib,html,json,re,subprocess,zipfile
from urllib.parse import urljoin
BASE=Path(__file__).resolve().parents[1];WORK=BASE/'work/model-research';WORK.mkdir(parents=True,exist_ok=True)
for source in json.loads((BASE/'scripts/model-sources.json').read_text()):
    archive=WORK/(source['archive']+'.zip')
    if not archive.exists():
        page=WORK/(source['archive']+'-source.html')
        subprocess.run(['curl','--fail','--location','--max-time','45',source['page'],'-o',str(page)],check=True)
        asset=source['page'].rstrip('/').split('/')[-1]
        match=re.search(r'href="([^\"]*/'+re.escape(asset)+r'\.zip[^\"]*)"',page.read_text())
        if not match:raise RuntimeError('The source page no longer offers the expected public download: '+source['page'])
        url=urljoin(source['page'],html.unescape(match.group(1)))
        subprocess.run(['curl','--fail','--location','--max-time','60',url,'-o',str(archive)],check=True)
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=source['sha256']:raise RuntimeError('Source archive changed; inspect before conversion: '+str(archive))
    directory=WORK/source['directory'];directory.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        if sum(i.file_size for i in z.infolist())>50*1024*1024:raise RuntimeError('Unexpectedly large asset archive')
        for item in z.infolist():
            path=PurePosixPath(item.filename)
            if path.is_absolute() or '..' in path.parts:raise RuntimeError('Unsafe source archive path')
        z.extractall(directory)
    print('Verified source:',source['archive'])
