"""Build a source-only download, excluding credentials, state and Site identity."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
files=['README.md','DEPLOYMENT.md','requirements.txt','requirements-dev.txt','Dockerfile','compose.yml','.env.example','.gitignore','.dockerignore']
for folder in ['app','tests','scripts','.github']:
    files.extend(str(p.relative_to(root)) for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc')
files.extend(['dist/index.html','dist/assets/app.js','dist/assets/style.css','dist/DEPLOYMENT.md'])
with ZipFile(root/'dist/job-hunter-source.zip','w',ZIP_DEFLATED) as z:
    for name in sorted(set(files)):z.write(root/name,'job-hunter/'+name)
print('Packaged',len(set(files)),'source files')
