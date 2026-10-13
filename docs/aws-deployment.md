# AWS deployment guide

## Recommended production layout

Use Chartwells' AWS account and an AWS region selected by its cloud team.

```text
Employees
  -> https://audit.compass-usa.com
  -> CloudFront
  -> private S3 bucket (React build)

Employees
  -> https://audit-api.compass-usa.com
  -> Application Load Balancer
  -> ECS Fargate service (Node API)
  -> RDS PostgreSQL (private subnets only)
```

Keep the S3 bucket and RDS instance private. Use ACM certificates for both HTTPS hostnames, Secrets Manager for the PostgreSQL connection string, and security groups that permit only the API service to reach the database.

## Before creating resources

1. Obtain the AWS account ID, approved region, and an IAM role with access to ECR, ECS, RDS, CloudFront, S3, ACM, Route 53 (or the corporate DNS provider), CloudWatch, and Secrets Manager.
2. Ask the Compass DNS administrator to reserve `audit.compass-usa.com` and `audit-api.compass-usa.com`, or provide approved alternatives.
3. Configure Microsoft Entra ID sign-in. The application currently uses a temporary local password for development and must not be exposed publicly with that authentication method.
4. Choose an RDS PostgreSQL version and a backup/retention policy with the Chartwells cloud team.

## API service

1. Create a private ECR repository, for example `handshake-audit-api`.
2. Build the container from `apps/api` and push it to ECR:

   ```powershell
   aws ecr get-login-password --region <region> |
     docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com

   docker build -t handshake-audit-api .\apps\api
   docker tag handshake-audit-api:latest <account-id>.dkr.ecr.<region>.amazonaws.com/handshake-audit-api:latest
   docker push <account-id>.dkr.ecr.<region>.amazonaws.com/handshake-audit-api:latest
   ```

3. Run the image in an ECS Fargate service in private subnets. Attach an Application Load Balancer target group with health check path `/health` and container port `3001`.
4. Do not put database credentials in GitHub, a Docker image, or a frontend build. The API supports either a custom connection-string secret injected as `DATABASE_URL`, or the JSON fields of the RDS-managed secret injected as `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`. The latter avoids copying a password into a second secret.
5. Set these ECS environment variables:

   ```text
   NODE_ENV=production
   PORT=3001
   CORS_ORIGIN=https://audit.compass-usa.com
   PGSSLMODE=verify-full
   PGSSLROOTCERT=/app/rds-global-bundle.pem
   ```

   The API image includes the current AWS RDS CA bundle. When using an RDS-managed master credential, choose each JSON key from that one Secrets Manager secret in the ECS task definition: `host` to `PGHOST`, `port` to `PGPORT`, `dbname` to `PGDATABASE`, `username` to `PGUSER`, and `password` to `PGPASSWORD`. This setup both encrypts the connection and verifies the RDS server certificate.

6. Use an API task security group that accepts port 3001 only from the load balancer security group. Allow the RDS security group to accept port 5432 only from the API task security group.

## Database

1. Create RDS PostgreSQL in private subnets with automated backups, encryption, and deletion protection enabled.
2. Create the `handshake_audit` database and a least-privilege application user.
3. Before starting the API service, run a one-off ECS task in the same VPC and security group as the API with command override `/app/scripts/migrate.sh`. Inject the same RDS-managed credential fields as the API task. The command tracks applied migration filenames and is safe to rerun.
4. Verify the API health endpoint through the load balancer after the migration completes.

## Frontend

1. Set the API endpoint before building:

   ```powershell
   $env:VITE_API_URL = "https://audit-api.compass-usa.com"
   npm run build
   ```

   Run this command from `apps/web`.

2. Create a private S3 bucket and upload the contents of `apps/web/dist`.
3. Create a CloudFront distribution using Origin Access Control so only CloudFront can read the bucket. Configure SPA fallback so 403/404 responses serve `/index.html` with HTTP 200.
4. Attach the ACM certificate for `audit.compass-usa.com` and create the corresponding DNS record.

## Release sequence

1. Deploy and verify in a staging environment first.
2. Run database migrations once, then deploy the ECS API.
3. Confirm `https://audit-api.../health` returns `{"status":"ok"}`.
4. Build the frontend with the production `VITE_API_URL`, publish it to S3, and invalidate the CloudFront distribution.
5. Verify sign-in, a submitted audit, audit visibility for its owner, and a coverage request end-to-end.
6. Merge `dev` to `prod` only after the staging verification succeeds.
