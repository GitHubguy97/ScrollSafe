ScrollSafe Demo Quick Reference

Docker Container Management

AIzaSyBHrvYu3pi1NVwUZHf5LCmY4Q7gxODftG8

**Start containers (detached mode)**:

\# API instance (backend + deepscan)

cd ~/scrollsafe-backend

docker-compose up -d



\# Doomscroller instance

cd ~/scrollsafe-doomscroller

docker compose -f infra/docker-compose.yaml up -d



**Stop containers:**

docker-compose down



\# or for doomscroller

docker compose -f infra/docker-compose.yaml down



ssh

ssh -i C:\\Users\\gideo\\Documents\\scroll-safe-key.pem ubuntu@3.150.22.249 backend

ssh -i C:\\Users\\gideo\\Documents\\scroll-safe-key.pem ubuntu@3.21.204.103 doomscroller



**Check container status:**

docker ps

docker compose ps





**View logs:**

docker logs -f doomscroller-worker









\# Follow logs

docker logs -f <container-name>



\# Last 50 lines

docker logs --tail 50 <container-name>



\# Exit log view: Ctrl+C (doesn't stop container)

Editing Environment Variables

\# On AWS instance

nano .env



\# Save: Ctrl+O, Enter

\# Exit: Ctrl+X



\# After editing, restart containers

docker compose down \&\& docker compose up -d

SSH to AWS Instances

\# API instance

ssh -i C:\\Users\\gideo\\Documents\\scroll-safe-key.pem ubuntu@api.scroll-safe.com



\# Doomscroller instance

ssh -i C:\\Users\\gideo\\Documents\\scroll-safe-key.pem ubuntu@3.21.204.103

Local Resolver Services

Start resolvers on local PC:

\# Deepscan resolver (port 5000)

python C:\\Users\\gideo\\Documents\\Hackathon-project\\resolver\\deepscan\_resolver.py



\# Doomscroller resolver (port 5001)

python C:\\Users\\gideo\\Documents\\Hackathon-project\\resolver\\doomscroller\_resolver.py

Key Container Names

API Instance:

scrollsafe-backend-api

scrollsafe-backend-postgres

scrollsafe-backend-redis

deepscan-worker

deepscan-beat

Doomscroller Instance:

doomscroller-worker

doomscroller-beat

doomscroller-flower

Quick Troubleshooting

Container won't start:

docker logs <container-name>  # Check for errors

Can't connect to Redis/Postgres:

Check AWS security group allows ports 6379 (Redis) and 5432 (Postgres)

Resolver not working:

Restart local resolver services

Check tunnel URLs are updated in .env files

Ready to set up persistent Cloudflare tunnels now?

