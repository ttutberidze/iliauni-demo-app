# ECS + RDS + GitHub Actions Demo (Ready Project)

This guide walks you through creating all AWS resources needed for the ECS + RDS + GitHub Actions demo using the AWS Console.

## Prerequisites

- AWS Account with appropriate permissions
- VPC with public and private subnets in at least 2 Availability Zones
- Basic understanding of AWS services

---

## Step 1: Create Security Groups

### 1.1 Create ALB Security Group

1. Navigate to **VPC** → **Security Groups** → **Create security group**
2. **Basic details**:
   - **Name**: `alb-sg`
   - **Description**: `Security group for Application Load Balancer`
   - **VPC**: Select your VPC
3. **Inbound rules**:
   - Click **Add rule**
   - **Type**: `HTTP`
   - **Port**: `80`
   - **Source**: `0.0.0.0/0` (or restrict to your IP for security)
   - (Optional) Add another rule for HTTPS on port `443`
4. **Outbound rules**: Leave default (allow all)
5. Click **Create security group**
6. **Note the Security Group ID** (e.g., `sg-xxxxxxxxx`)

### 1.2 Create ECS Tasks Security Group

1. Navigate to **VPC** → **Security Groups** → **Create security group**
2. **Basic details**:
   - **Name**: `ecs-tasks-sg`
   - **Description**: `Security group for ECS tasks`
   - **VPC**: Select your VPC (same as ALB)
3. **Inbound rules**:
   - Click **Add rule**
   - **Type**: `Custom TCP`
   - **Port**: `3000` (or `80` if your app runs on port 80)
   - **Source**: Select `alb-sg` from the dropdown (or enter the ALB security group ID)
4. **Outbound rules**: Leave default (allow all)
5. Click **Create security group**
6. **Note the Security Group ID** (e.g., `sg-yyyyyyyyy`)

### 1.3 Create RDS Security Group

1. Navigate to **VPC** → **Security Groups** → **Create security group**
2. **Basic details**:
   - **Name**: `rds-sg`
   - **Description**: `Security group for RDS MySQL database`
   - **VPC**: Select your VPC (same as above)
3. **Inbound rules**:
   - Click **Add rule**
   - **Type**: `MySQL/Aurora`
   - **Port**: `3306`
   - **Source**: Select `ecs-tasks-sg` from the dropdown (or enter the ECS tasks security group ID)
4. **Outbound rules**: Leave default (allow all)
5. Click **Create security group**
6. **Note the Security Group ID** (e.g., `sg-zzzzzzzzz`)
---

## Step 2: Create IAM Roles

**IMPORTANT**: Create IAM roles before creating resources that need them (task definitions, GitHub Actions).

### 2.1 Create ECS Task Execution Role

1. Navigate to **IAM** → **Roles** → **Create role**
2. **Trust entity type**: `AWS service`
3. **Use case**: Select `ECS` → `ECS Task`
4. Click **Next**
5. **Permissions**:
   - Search and attach: `AmazonECSTaskExecutionRolePolicy`
   - If using Secrets Manager, also attach: `SecretsManagerReadWrite` (or create custom policy for specific secrets)
6. Click **Next**
7. **Role name**: `ecsTaskExecutionRole` (or `ecsTaskExecutionRoleDemo`)
8. **Description**: `Role for ECS tasks to pull images and write logs`
9. Click **Create role**
10. **Note the Role ARN** (e.g., `arn:aws:iam::123456789012:role/ecsTaskExecutionRole`)

**Important**: The `AmazonECSTaskExecutionRolePolicy` allows writing to existing log groups but **NOT creating new ones**. You have two options:
- **Option 1 (Recommended)**: Create the log group manually (see Step 6 below) - this is simpler
- **Option 2**: Add `logs:CreateLogGroup` permission if you want ECS to auto-create log groups:
  - Go to the role → **Add permissions** → **Create inline policy**
  - JSON: `{"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": "logs:CreateLogGroup", "Resource": "arn:aws:logs:*:*:log-group:/ecs/*"}]}`

### 2.2 Create ECS Task Role

1. Navigate to **IAM** → **Roles** → **Create role**
2. **Trust entity type**: `AWS service`
3. **Use case**: Select `ECS` → `ECS Task`
4. Click **Next**
5. **Permissions**: 
   - For basic RDS connection, no policies needed (RDS uses security groups)
   - Add policies only if your app needs to access other AWS services
6. Click **Next**
7. **Role name**: `ecsTaskRole` (or `ecsTaskRoleDemo`)
8. **Description**: `Role for application running in ECS tasks`
9. Click **Create role**
10. **Note the Role ARN**

### 2.3 Create GitHub Actions OIDC Identity Provider

1. Navigate to **IAM** → **Identity providers** → **Add provider**
2. **Provider type**: `OpenID Connect`
3. **Provider URL**: `https://token.actions.githubusercontent.com`
4. **Audience**: `sts.amazonaws.com`
5. Click **Add provider**

### 2.4 Create GitHub Actions IAM Role

1. Navigate to **IAM** → **Roles** → **Create role**
2. **Trust entity type**: `Web identity`
3. **Identity provider**: Select `token.actions.githubusercontent.com`
4. **Audience**: `sts.amazonaws.com`
5. **Conditions** (for security):
   - Click **Add condition**
   - **Condition key**: `token.actions.githubusercontent.com:sub`
   - **Operator**: `StringEquals` (or `StringLike` for wildcards)
   - **Value**: `repo:YOUR_GITHUB_USERNAME/YOUR_REPO_NAME:*`
     - Example: `repo:myusername/ecs-rds-gha-demo:*`
     - For specific branch: `repo:myusername/ecs-rds-gha-demo:ref:refs/heads/main`
6. Click **Next**
7. **Permissions**:
   - Attach: `AmazonEC2ContainerRegistryFullAccess`
   - Attach: `AmazonECS_FullAccess`
8. **Add inline policy for `iam:PassRole`**:
   - Click **Add permissions** → **Create inline policy**
   - Switch to **JSON** tab
   - Paste this (replace `<ACCOUNT_ID>` with your AWS account ID):
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": "iam:PassRole",
           "Resource": [
             "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskExecutionRole*",
             "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskRole*"
           ]
         }
       ]
     }
     ```
   - Policy name: `PassECSTaskRoles`
   - Click **Create policy**
9. Click **Next**
10. **Role name**: `GitHubActionsECSRole`
11. **Description**: `Role for GitHub Actions to deploy to ECS`
12. Click **Create role**
13. **Note the Role ARN** (you'll need this for GitHub Secrets in Step 12)

---

## Step 3: Create RDS MySQL Database

1. Navigate to **RDS** → **Databases** → **Create database**
2. **Engine options**:
   - **Engine type**: `MySQL`
   - **Version**: Select latest stable version (e.g., `MySQL 8.0`)
3. **Templates**: Select `Free tier` (for testing) or `Production` (for production)
4. **Settings**:
   - **DB instance identifier**: `database-1` (or your preferred name)
   - **Master username**: `admin` (or your preferred username)
   - **Master password**: Create a strong password (you'll need this later)
   - **Confirm password**: Re-enter the password
5. **Instance configuration**:
   - **DB instance class**: `db.t3.micro` (for free tier) or larger for production
6. **Storage**:
   - Leave defaults or adjust as needed
7. **Connectivity**:
   - **VPC**: Select your VPC
   - **Subnet group**: Create new or select existing DB subnet group (should include private subnets)
   - **Public access**: **No** (keep database private)
   - **VPC security group**: Select `rds-sg` (the one you created)
   - **Availability Zone**: Leave default or select specific AZ
8. **Database authentication**: `Password authentication`
9. **Additional configuration** (optional):
   - **Initial database name**: `appdb` (or your preferred name)
   - **Backup retention**: Set as needed (7 days for production)
10. Click **Create database**
11. **Wait for database to be available** (5-10 minutes)
12. **Note the endpoint** (e.g., `database-1.xxxxx.region.rds.amazonaws.com`)

### 3.1 Store RDS Credentials in Secrets Manager (Recommended)

1. Navigate to **Secrets Manager** → **Store a new secret**
2. **Secret type**: `Credentials for Amazon RDS database`
3. **Credentials**:
   - **Username**: Enter your RDS master username
   - **Password**: Enter your RDS master password
4. **Database**: Select your RDS instance from the dropdown
5. Click **Next**
6. **Secret name**: `rds/db-credentials` (or your preferred name)
7. Click **Next**
8. **Configure rotation**: Leave disabled for now
9. Click **Next**
10. Review and click **Store**
11. **Note the Secret ARN** (you'll need this for the task definition)

---

## Step 4: Create ECR Repository

1. Navigate to **ECR** → **Repositories** → **Create repository**
2. **Visibility settings**: `Private`
3. **Repository name**: `ecs-rds-gha-demo` (or match your project name)
4. **Tag immutability**: Optional (recommended: `Enabled`)
5. **Scan on push**: Optional (recommended: `Enabled`)
6. **Encryption**: Leave default (AWS managed)
7. Click **Create repository**
8. **Note the repository URI** (e.g., `123456789012.dkr.ecr.eu-west-2.amazonaws.com/ecs-rds-gha-demo`)

---

## Step 5: Create CloudWatch Log Group

**IMPORTANT**: The log group name must match your task definition family name exactly. The format is `/ecs/<task-definition-family-name>`.

**Example**: If your task definition family is `iliauni-demo-app`, the log group must be `/ecs/iliauni-demo-app` (case-sensitive).

1. Navigate to **CloudWatch** → **Log groups** → **Create log group**
2. **Log group name**: `/ecs/iliauni-demo-app` (replace `iliauni-demo-app` with your actual task definition family name)
   - Format: `/ecs/<your-task-definition-family-name>`
   - Must match exactly (case-sensitive)
3. **Data protection**: Optional (leave disabled for demo)
4. **Log class**: `Standard`
5. **Retention**: Select retention period (e.g., `7 days` to manage costs)
6. Click **Create**

**Note**: This log group must be created BEFORE deploying your ECS service. If it doesn't exist, tasks will fail to start with a permission error (unless your execution role has `logs:CreateLogGroup` permission).

---

## Step 6: Create Application Load Balancer

1. Navigate to **EC2** → **Load Balancers** → **Create Load Balancer**
2. Select **Application Load Balancer**
3. **Basic configuration**:
   - **Name**: `ecs-rds-demo-alb`
   - **Scheme**: `Internet-facing`
   - **IP address type**: `IPv4`
4. **Network mapping**:
   - **VPC**: Select your VPC
   - **Availability Zones**: Select at least 2 public subnets in different AZs
   - Enable subnets in multiple AZs for high availability
5. **Security groups**: Select `alb-sg`
6. **Listeners and routing**:
   - **Protocol**: `HTTP`
   - **Port**: `80`
   - **Default action**: We'll create target group next, so select "Create target group" or leave default for now
7. Click **Create load balancer**
8. **Wait for ALB to be active** (1-2 minutes)
9. **Note the ALB DNS name** (e.g., `ecs-rds-demo-alb-1234567890.region.elb.amazonaws.com`)

---

## Step 7: Create Target Group

1. Navigate to **EC2** → **Target Groups** → **Create target group**
2. **Target type**: `IP addresses` (required for Fargate)
3. **Target group name**: `ecs-rds-demo-tg`
4. **Protocol**: `HTTP`
5. **Port**: `3000` (or `80` if your app runs on port 80)
6. **VPC**: Select your VPC
7. **Health checks**:
   - **Health check protocol**: `HTTP`
   - **Health check path**: `/health`
   - **Advanced health check settings**:
     - **Healthy threshold**: `2`
     - **Unhealthy threshold**: `2`
     - **Timeout**: `5` seconds
     - **Interval**: `30` seconds
     - **Success codes**: `200`
8. Click **Next**
9. **Register targets**: Skip for now (ECS service will register targets automatically)
10. Click **Create target group**

### 7.1 Configure ALB Listener to Forward to Target Group

1. Navigate to **EC2** → **Load Balancers** → Select your ALB
2. Go to the **Listeners** tab
3. Click on the listener (HTTP:80)
4. Click **Edit**
5. **Default action**: Select `Forward to...` → Choose your target group (`ecs-rds-demo-tg`)
6. Click **Save changes**

---

## Step 8: Create ECS Cluster

1. Navigate to **ECS** → **Clusters** → **Create cluster**
2. **Cluster configuration**:
   - **Cluster name**: `demo-cluster` (or your preferred name)
   - **Infrastructure**: `AWS Fargate (serverless)`
3. **Monitoring**: Optional (enable CloudWatch Container Insights if desired)
4. Click **Create**
5. **Wait for cluster to be created**

---

## Step 9: Create ECS Task Definition

1. Navigate to **ECS** → **Task definitions** → **Create new task definition**
2. **Task definition family**: `iliauni-demo-app` (or your preferred name)
3. **Launch type**: `Fargate`
4. **Task size**:
   - **CPU**: `0.5 vCPU` (512)
   - **Memory**: `1 GB` (1024)
5. **Task role**: Select `ecsTaskRole` (or `ecsTaskRoleDemo`) - created in Step 2.2
6. **Task execution role**: Select `ecsTaskExecutionRole` (or `ecsTaskExecutionRoleDemo`) - created in Step 2.1
7. **Network mode**: `awsvpc`
8. **Container definitions** → **Add container**:
   - **Container name**: `iliauni-demo-app` (or `app`)
   - **Image URI**: For now, use a placeholder like `123456789012.dkr.ecr.eu-west-2.amazonaws.com/ecs-rds-gha-demo:latest`
     - This will be updated by GitHub Actions during deployment
     - **Note**: ECS Fargate requires `linux/amd64` architecture. The GitHub Actions workflow builds images with `--platform linux/amd64` automatically.
   - **Essential container**: `Yes`
   - **Port mappings**:
     - **Container port**: `80` (or `3000` if your app runs on 3000)
     - **Protocol**: `TCP`
   - **Environment variables**:
     - `PORT` = `80`
     - `APP_VERSION` = `1.0.0`
     - `GIT_SHA` = `set-by-ci`
     - `FEATURE_NEW_UI` = `false`
     - `DB_HOST` = Your RDS endpoint (e.g., `database-1.xxxxx.region.rds.amazonaws.com`)
     - `DB_PORT` = `3306`
     - `DB_NAME` = `appdb` (or your database name)
   - **Secrets** (if using Secrets Manager):
     - **Method 1 (Form Interface)**: If you see a "Secrets" section in the form:
       - Click **Add secret**
       - **Secret**: Select your RDS secret from Secrets Manager
       - **Key to retrieve**: `username`
       - **Value**: `DB_USER`
       - Click **Add secret** again for `DB_PASSWORD`
     - **Method 2 (JSON Editor - Recommended)**: If you don't see a Secrets section:
       - Click **JSON** tab (top right of the page)
       - Find your container in `containerDefinitions` array
       - Add a `secrets` array at the same level as `environment`:
         ```json
         "secrets": [
           {
             "name": "DB_USER",
             "valueFrom": "arn:aws:secretsmanager:eu-west-2:425210931122:secret:rds!db-...:username::"
           },
           {
             "name": "DB_PASSWORD",
             "valueFrom": "arn:aws:secretsmanager:eu-west-2:425210931122:secret:rds!db-...:password::"
           }
         ]
         ```
       - **ARN Formats**:
         - **RDS secrets**: `arn:aws:secretsmanager:REGION:ACCOUNT:secret:rds!SECRET_ID:KEY::`
         - **JSON secrets**: `arn:aws:secretsmanager:REGION:ACCOUNT:secret:SECRET_NAME-SUFFIX:KEY::`
         - **Plain text**: `arn:aws:secretsmanager:REGION:ACCOUNT:secret:SECRET_NAME-SUFFIX`
       - Get the ARN from **Secrets Manager** → Your secret → Copy ARN
     - **Note**: Your execution role needs `secretsmanager:GetSecretValue` permission (see Step 2.1)
   - **Logging**:
     - **Log driver**: `awslogs`
     - **Log group**: `/ecs/iliauni-demo-app` (must match the log group created in Step 5)
     - **Log stream prefix**: `ecs`
     - **Region**: Your AWS region (e.g., `eu-west-2`)
   - **Health check** (optional but recommended):
     - **Command**: `CMD-SHELL,wget -qO- http://localhost/health || exit 1`
     - **Interval**: `30`
     - **Timeout**: `5`
     - **Retries**: `3`
     - **Start period**: `15`
9. Click **Create**
10. **Note the Task Definition ARN**

---

## Step 10: Create ECS Service

1. Navigate to **ECS** → **Clusters** → Select your cluster (`demo-cluster`)
2. Go to the **Services** tab
3. Click **Create**
4. **Service configuration**:
   - **Launch type**: `Fargate`
   - **Task definition**:
     - **Family**: Select `iliauni-demo-app`
     - **Revision**: Select `1` (latest)
   - **Service name**: `demo-service`
   - **Number of tasks**: `1` (adjust as needed)
5. **Networking** - Choose one of the following options:

### Option A: Private Subnets with VPC Endpoints (Recommended for Production)

- **VPC**: Select your VPC
- **Subnets**: Select **private subnets** (at least 2 for high availability)
- **Security groups**: Select `ecs-tasks-sg`
- **Auto-assign public IP**: **DISABLED** (tasks are in private subnets)
- **Prerequisites**: You must have created VPC endpoints for ECR (see troubleshooting section for details)
- **Benefits**: More secure, tasks not exposed to internet
- **Cost**: ~$14.40/month for VPC endpoints

### Option B: Public Subnets with Auto-Assign Public IP (Quick Testing/Demo)

- **VPC**: Select your VPC
- **Subnets**: Select **public subnets** (at least 2 for high availability)
- **Security groups**: Select `ecs-tasks-sg`
- **Auto-assign public IP**: **ENABLED** (tasks can reach internet)
- **Prerequisites**: None (no VPC endpoints needed)
- **Benefits**: Quick setup, no VPC endpoint costs
- **Security Warning**: Tasks are exposed to internet (use only for testing/demos)
- **When to use**: Development, testing, quick demos

6. **Load balancing**:
   - **Load balancer type**: `Application Load Balancer`
   - **Load balancer name**: Select your ALB (`ecs-rds-demo-alb`)
   - **Container to load balance**: Select your container name (`iliauni-demo-app`)
   - **Production listener port**: `80:HTTP`
   - **Target group name**: Select your target group (`ecs-rds-demo-tg`)
   - **Health check grace period**: `60` seconds
7. **Service Auto Scaling** (optional):
   - Enable if you want auto-scaling based on CPU/memory
8. Click **Create**
9. **Wait for service to stabilize** (tasks should start running)

---

## Step 11: Configure GitHub Secrets

**IMPORTANT**: Configure GitHub secrets AFTER creating the GitHub Actions IAM role (Step 2.4).

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add each of the following:

   - **Secret name**: `AWS_ROLE_ARN`
     - **Value**: Your GitHub Actions IAM role ARN from Step 2.4 (e.g., `arn:aws:iam::123456789012:role/GitHubActionsECSRole`)
   
   - **Secret name**: `AWS_REGION`
     - **Value**: Your AWS region (e.g., `eu-west-2`)
   
   - **Secret name**: `ECR_REPOSITORY`
     - **Value**: Your ECR repository name (e.g., `ecs-rds-gha-demo`)
   
   - **Secret name**: `ECS_CLUSTER`
     - **Value**: Your ECS cluster name (e.g., `demo-cluster`)
   
   - **Secret name**: `ECS_SERVICE`
     - **Value**: Your ECS service name (e.g., `demo-service`)

---

## Step 12: Verify Setup

### 12.1 Check ECS Service Status

1. Navigate to **ECS** → **Clusters** → Your cluster → **Services** → Your service
2. Verify tasks are running and healthy
3. Check the **Logs** tab to see application logs

### 12.2 Test Application Endpoints

1. Get your ALB DNS name from **EC2** → **Load Balancers** → Your ALB
2. Test the following URLs in your browser or with `curl`:
   - `http://<alb-dns>/health` - Should return `{"ok":true,...}`
   - `http://<alb-dns>/version` - Should return version info
   - `http://<alb-dns>/feature` - Should return feature flag status
   - `http://<alb-dns>/db` - Should return database connection info (if DB credentials are configured)

### 12.3 Verify Security Groups

1. Ensure ALB security group allows inbound on port 80
2. Ensure ECS tasks security group allows inbound on port 3000 (or 80) from ALB security group
3. Ensure RDS security group allows inbound on port 3306 from ECS tasks security group

---

## Step 13: First Deployment via GitHub Actions

1. Push your code to the `main` branch (or the branch configured in your workflow)
2. Go to **GitHub** → **Actions** tab in your repository
3. Watch the workflow run:
   - It should build the Docker image
   - Push to ECR
   - Update the task definition
   - Deploy to ECS service
4. Wait for the deployment to complete
5. Verify the new version is running by checking `/version` endpoint
