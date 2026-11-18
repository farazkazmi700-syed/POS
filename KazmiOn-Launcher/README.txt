KazmiOn POS launcher - matched to public repository compose filenames
Repository: https://github.com/farazkazmi700-syed/POS

INSTALL / TEST
1. Copy KazmiOn-Start.ps1 and KazmiOn-Launch.bat to the ROOT of your POS checkout (alongside docker-compose.yml).
2. Configure .env (do not commit secrets).
3. Install and start Docker Desktop / Docker Engine.
4. First time only, build images in the repository root:
   docker compose -f docker-compose.yml -p kazmion build
5. Double-click KazmiOn-Launch.bat. It starts existing images, polls http://localhost:8080, then opens the browser.
6. Optional production overlay: KazmiOn-Launch.bat -Mode production
   Production overlay publishes port 80, so it opens http://localhost .

NOTES
- The published repository currently uses MongoDB and Redis; it has NOT been migrated to PostgreSQL.
- MongoDB, Redis and invoice volumes are preserved: the launcher does not run `down -v`.
- Inno Setup script is a launcher-only prototype. Its installed shortcut cannot launch POS unless compose files, .env, images and Docker are provisioned at the installed location. For now use the BAT in the repository root.
- The web polling checks HTTP readiness, not full API/database readiness.
- A first-run image build requires project source and build dependencies; commercial offline packaging needs exported images and a runtime installer.
