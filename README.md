# ECS + RDS + GitHub Actions Demo (Ready Project)


## 1. CI, CD, and the Deployment Pipeline

### Continuous Integration (CI)

**CI means that developers integrate their code changes into a shared repository frequently — often multiple times a day.**

Every change triggers automatic checks. These checks usually include:
- code linting,
- unit tests,
- building the application,
- sometimes security or dependency scans.

**The goal of CI is simple:** Detect problems early, when they are cheap and easy to fix.

Instead of discovering errors days or weeks later, CI ensures we know immediately if something is broken.

**Key idea to remember:** CI answers the question: **"Is this code correct and buildable?"**

### Continuous Delivery vs Continuous Deployment

**Continuous Delivery** means:
- every change that passes CI is ready to be deployed,
- but deployment may still require a manual approval.

**Continuous Deployment** goes one step further:
- every change that passes CI is automatically deployed to production,
- with no manual approval step.

**A simple way to remember this:**
- Continuous Delivery → deployable at any time
- Continuous Deployment → automatically deployed

**Why do teams prefer Continuous Deployment?**
- Changes are smaller and safer
- Feedback from production is faster
- Rollbacks are normal and expected, not emergencies

---

## 2. Why Deployments Fail in Real Life

At this point, a natural question is: **"If we have CI and tests, why do deployments still fail?"**

In real systems, production failures happen because of:
- environment differences (configuration, secrets, OS libraries),
- database schema changes,
- external dependencies such as APIs,
- unexpected traffic spikes,
- bugs that only appear at real scale.

**So the conclusion is important:** Continuous Deployment alone is not enough. We need deployment strategies that allow us to release changes gradually and safely.

---

## 3. Deployment Strategies

### Rolling Deployment (Baseline Strategy)

The simplest strategy is **rolling deployment**.

In a rolling deployment:
- old instances are gradually replaced with new ones,
- both versions may run at the same time for a short period.

In ECS, this means:
- new tasks start,
- old tasks stop one by one.

Rolling deployments are easy and commonly used, but they have downsides:
- rollback can be slow,
- users may hit different versions at the same time.

Rolling deployment is our baseline — now let's see safer alternatives.

---

## 4. Blue-Green Deployment

### Concept

**Blue-Green deployment uses two environments:**
- **Blue**: the current production version
- **Green**: the new version

Only one environment serves users at a time.

### How it works (step by step)

1. Blue is live and serving 100% of traffic.
2. We deploy the new version to Green.
3. Green does not receive real traffic yet.
4. We run health checks and smoke tests on Green.
5. When we trust it, we switch traffic from Blue to Green using the load balancer.
6. Blue stays available for a short time as a rollback option.

### Why teams use Blue-Green

- Near-zero downtime
- Very fast rollback (just switch traffic back)
- Clear separation between old and new versions

### The database problem (important!)

Blue-Green is easy for stateless applications, but databases make it harder.

If the new version changes the database schema in a way the old version doesn't understand, rollback may fail.

That's why teams use **backward-compatible migrations**:
- add new columns first,
- deploy code that works with both old and new schemas,
- clean up old schema later.

### Blue-Green in ECS

In ECS, Blue and Green usually mean:
- two target groups,
- and an ALB listener that switches traffic between them.

---

## 5. Canary Deployment

### Concept

**Canary deployment** means:
- We release the new version to a small percentage of real users first.
- The name comes from "canary in a coal mine" — an early warning system.

### How it works (step by step)

1. The new version is deployed alongside the old one.
2. About 5–10% of traffic is routed to the new version.
3. We monitor metrics:
   - error rate,
   - latency,
   - CPU and memory usage,
   - logs.
4. If everything looks good, we increase traffic gradually.
5. If something goes wrong, we stop the rollout immediately.

### Why Canary is powerful

- Lowest risk deployment strategy
- Real production behavior is tested
- Failures affect very few users

### Trade-offs

- Requires good monitoring
- Routing configuration is more complex

### Canary in ECS

Canary deployments are typically implemented using:
- weighted routing in the load balancer, or
- multiple ECS services behind one ALB.

---

## 6. Feature Flags — Release Without Deploy

This is usually the **"aha moment"**.

### The problem Feature Flags solve

Sometimes you want to:
- deploy code but not expose it yet,
- test features safely in production,
- enable features only for admins,
- perform A/B testing,
- instantly disable a broken feature.

### What is a Feature Flag?

A **feature flag** is a runtime switch that controls whether a feature is enabled.

**The key distinction:**
- **Deployment** puts code into production
- **Release** makes the feature visible to users

Feature flags separate these two actions.

### Example scenario

- Today: deploy code with `FEATURE_NEW_CHECKOUT=false`
- Tomorrow: enable it for 10% of users
- If error rate increases: disable it instantly
- **No redeployment required**

### Where feature flags live

- Environment variables
- Database or configuration services
- Dedicated platforms (LaunchDarkly, Unleash)

### Best practices

- Assign ownership to flags
- Remove flags after use
- Avoid complex nested flag logic
- Use flags as safety tools, not permanent architecture

---

## 7. Putting It All Together

- **CI/CD** automates how code moves to production.
- **Deployment strategies** control how traffic is shifted.
- **Feature flags** control what users actually see.

---

## What you get
- Node/Express app with endpoints:
  - `/health` (for ALB/ECS health checks)
  - `/version` (shows build metadata)
  - `/feature` (feature flag demo)
  - `/db` (checks connectivity to RDS MySQL; requires env vars)
- Dockerfile to build a container image
- ECS Fargate task definition template (`ecs/task-definition.json`)
- GitHub Actions workflow that:
  1) builds & pushes image to ECR
  2) registers a new task definition revision
  3) updates ECS service and waits for stability

---
---
## Public ALB (Internet-facing) setup

Recommended network model:
- **ALB is internet-facing** (public subnets, route to Internet Gateway)
- **ECS tasks are private** (private subnets, **no public IP**)
- **RDS is private** (private subnets, **public access: NO**)

### Security Groups

**ALB SG (`alb-sg`)**
- Inbound: TCP 80 from `0.0.0.0/0`
- (Optional) Inbound: TCP 443 from `0.0.0.0/0`
- Outbound: all

**ECS Tasks SG (`ecs-tasks-sg`)**
- Inbound: TCP **3000** from **ALB SG only**
- Outbound: all

**RDS SG (`rds-sg`)**
- Inbound: TCP **3306** from **ECS Tasks SG only**
- Outbound: all

### ALB / Target Group
- Target group type: **IP**
- Target group port: **3000**
- Health check path: **/health**
- Listener: 80 → forward to target group (or 443 with ACM cert)

### ECS Service networking
- Subnets: **private**
- Assign public IP: **DISABLED**
- SG: `ecs-tasks-sg`

### RDS
- Subnets: **private**
- Public access: **NO**
- SG: `rds-sg`

---
## Secrets Manager (recommended for DB password)

For a classroom demo you can set DB credentials as environment variables.
For a more realistic setup, store `DB_PASSWORD` in **AWS Secrets Manager** and inject it in the task definition via the `secrets` field.

---
## Quick verification after deploy
- `http://<alb-dns>/health`
- `http://<alb-dns>/version`
- `http://<alb-dns>/feature`
- After DB env/secrets: `http://<alb-dns>/db`

## 1) Prerequisites (AWS)
You need these AWS resources (create them via console or IaC):
1. **ECR repository**: `ecs-rds-gha-demo`
2. **ECS Cluster** (Fargate): `demo-cluster`
3. **ECS Service**: `demo-service`
   - Behind an **Application Load Balancer**
   - Listener forwards to target group where container port is `3000`
   - Health check path: `/health`
4. **CloudWatch Log Group**: `/ecs/ecs-rds-gha-demo`
   - Create via console: **CloudWatch** → **Log groups** → **Create log group**
   - Or via CLI: `aws logs create-log-group --log-group-name "/ecs/ecs-rds-gha-demo" --region <REGION>`
   - Recommended: Set retention policy (e.g., 7 days) to manage costs
5. **RDS MySQL** in private subnets (recommended)
   - Security Group: inbound MySQL (3306) allowed **from ECS tasks SG only**
   - If using RDS-generated secrets, note the secret ARN for task definition

---

## 1.1) Setting Up Application Load Balancer (ALB)

This section provides step-by-step instructions for creating an ALB and connecting it to your ECS service.

### Step 1: Create Security Groups

#### ALB Security Group (`alb-sg`)

1. Go to **VPC** → **Security Groups** → **Create security group**
2. **Name**: `alb-sg`
3. **Description**: "Security group for Application Load Balancer"
4. **VPC**: Select your VPC
5. **Inbound rules**:
   - Type: `HTTP`, Port: `80`, Source: `0.0.0.0/0` (or restrict to your IP)
   - (Optional) Type: `HTTPS`, Port: `443`, Source: `0.0.0.0/0`
6. **Outbound rules**: Allow all (default)
7. Click **Create security group**

#### ECS Tasks Security Group (`ecs-tasks-sg`)

1. Go to **VPC** → **Security Groups** → **Create security group**
2. **Name**: `ecs-tasks-sg`
3. **Description**: "Security group for ECS tasks"
4. **VPC**: Select your VPC
5. **Inbound rules**:
   - Type: `Custom TCP`, Port: `3000`, Source: Select `alb-sg` security group
6. **Outbound rules**: Allow all (default)
7. Click **Create security group**

**Note**: Make sure the ECS tasks security group allows inbound traffic from the ALB security group, not from `0.0.0.0/0`.

### Step 2: Create Application Load Balancer

1. Go to **EC2** → **Load Balancers** → **Create Load Balancer**
2. Select **Application Load Balancer**
3. **Basic configuration**:
   - **Name**: `ecs-rds-demo-alb`
   - **Scheme**: **Internet-facing** (for public access)
   - **IP address type**: **IPv4**
4. **Network mapping**:
   - **VPC**: Select your VPC
   - **Availability Zones**: Select at least 2 public subnets in different AZs
   - **Mappings**: Enable subnets in multiple AZs for high availability
5. **Security groups**: Select `alb-sg`
6. **Listeners and routing**:
   - **Protocol**: `HTTP`, **Port**: `80`
   - **Default action**: Create new target group (we'll configure this next)
7. Click **Create load balancer**

### Step 3: Create Target Group

1. Go to **EC2** → **Target Groups** → **Create target group**
2. **Target type**: **IP addresses** (required for Fargate)
3. **Target group name**: `ecs-rds-demo-tg`
4. **Protocol**: `HTTP`
5. **Port**: `3000` (matches your container port)
6. **VPC**: Select your VPC
7. **Health checks**:
   - **Health check protocol**: `HTTP`
   - **Health check path**: `/health` (matches your app's health endpoint)
   - **Advanced health check settings**:
     - **Healthy threshold**: `2`
     - **Unhealthy threshold**: `2`
     - **Timeout**: `5` seconds
     - **Interval**: `30` seconds
     - **Success codes**: `200`
8. Click **Next**
9. **Register targets**: Skip for now (ECS service will register targets automatically)
10. Click **Create target group**

### Step 4: Configure ALB Listener

1. Go to **EC2** → **Load Balancers** → Select your ALB
2. Go to the **Listeners** tab
3. Click **View/Edit rules** on the HTTP:80 listener
4. **Default action**: Forward to `ecs-rds-demo-tg`
5. Click **Save**

### Step 5: Create ECS Service with ALB Integration

1. Go to **ECS** → **Clusters** → Select your cluster → **Services** tab
2. Click **Create** (or **Update** if service exists)
3. **Service configuration**:
   - **Launch type**: **Fargate**
   - **Task Definition**: Select your task definition
   - **Service name**: `demo-service`
   - **Number of tasks**: `1` (or desired count)
4. **Networking**:
   - **VPC**: Select your VPC
   - **Subnets**: Select **private subnets** (at least 2 for high availability)
   - **Security groups**: Select `ecs-tasks-sg`
   - **Auto-assign public IP**: **DISABLED** (tasks are in private subnets)
5. **Load balancing**:
   - **Load balancer type**: **Application Load Balancer**
   - **Load balancer name**: Select your ALB (`ecs-rds-demo-alb`)
   - **Container to load balance**: Select your container name (`app`)
   - **Production listener port**: `80:HTTP`
   - **Target group name**: Select your target group (`ecs-rds-demo-tg`)
   - **Health check grace period**: `60` seconds
6. **Service Auto Scaling** (optional): Configure if you want auto-scaling
7. Click **Create** (or **Update**)


---
## 2) IAM: secure GitHub → AWS (OIDC)

Recommended approach: use **GitHub OIDC** to assume an AWS role without storing AWS keys.

### Step 1: Create OIDC Identity Provider

1. Go to **IAM** → **Identity providers** → **Add provider**
2. **Provider type**: OpenID Connect
3. **Provider URL**: `https://token.actions.githubusercontent.com`
4. **Audience**: `sts.amazonaws.com`
5. Click **Add provider**

### Step 2: Create IAM Role for GitHub Actions

1. Go to **IAM** → **Roles** → **Create role**
2. **Trust entity type**: Web identity
3. **Identity provider**: Select `token.actions.githubusercontent.com`
4. **Audience**: `sts.amazonaws.com`
5. **Conditions** (recommended for security):
   - Click **Add condition**
   - **Condition key**: `token.actions.githubusercontent.com:sub`
   - **Operator**: StringEquals (or StringLike for wildcards)
   - **Value**: `repo:YOUR_GITHUB_USERNAME/YOUR_REPO_NAME:*`
     - Example: `repo:myusername/ecs-rds-gha-demo:*`
     - For specific branch: `repo:myusername/ecs-rds-gha-demo:ref:refs/heads/main`
6. Click **Next**
7. **Attach permissions policies**:
   - `AmazonEC2ContainerRegistryFullAccess` (for ECR push/pull)
   - `AmazonECS_FullAccess` (for ECS task definition and service updates)
8. **Add inline policy for `iam:PassRole`** (REQUIRED):
   - Click **Add permissions** → **Create inline policy**
   - Switch to **JSON** tab
   - Paste this policy (replace `<ACCOUNT_ID>` and role names with your actual values):
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
9. **Role name**: `GitHubActionsECSRole` (or your preferred name)
10. **Description**: "Role for GitHub Actions to deploy to ECS"
11. Click **Create role**
12. Copy the **Role ARN** (you'll need this for GitHub Secrets)

### Step 3: Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:
   - `AWS_ROLE_ARN` = your IAM role ARN (e.g., `arn:aws:iam::123456789012:role/GitHubActionsECSRole`)
   - `AWS_REGION` = your AWS region (e.g., `eu-west-2`)
   - `ECR_REPOSITORY` = your ECR repository name (e.g., `ecs-rds-gha-demo`)
   - `ECS_CLUSTER` = your ECS cluster name (e.g., `demo-cluster`)
   - `ECS_SERVICE` = your ECS service name (e.g., `demo-service`)

### Required Permissions Summary for GitHub Actions Role

The GitHub Actions role needs:
- **ECR permissions**: Push/pull images (`AmazonEC2ContainerRegistryFullAccess`)
- **ECS permissions**: Register task definitions, update services (`AmazonECS_FullAccess`)
- **IAM permissions**: Pass the ECS task roles to ECS (`iam:PassRole` on execution and task roles)

---

## 2.1) IAM: ECS Task Roles

Your ECS tasks need two IAM roles:

### Execution Role (`ecsTaskExecutionRole`)

Used by ECS to pull images from ECR, write logs to CloudWatch, and retrieve secrets from Secrets Manager.

1. Go to **IAM** → **Roles** → **Create role**
2. **Trust entity type**: Custom trust policy
3. **Trust policy** (paste this JSON):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Service": "ecs-tasks.amazonaws.com"
         },
         "Action": "sts:AssumeRole"
       }
     ]
   }
   ```
4. **Attach permissions**:
   - `AmazonECSTaskExecutionRolePolicy` (required - provides ECR and CloudWatch Logs access)
   - **For Secrets Manager** (if using secrets in task definition):
     - Option 1: Attach `SecretsManagerReadWrite` (broad access)
     - Option 2: Create inline policy with specific secret access (recommended):
       ```json
       {
         "Version": "2012-10-17",
         "Statement": [
           {
             "Effect": "Allow",
             "Action": [
               "secretsmanager:GetSecretValue",
               "secretsmanager:DescribeSecret"
             ],
             "Resource": "arn:aws:secretsmanager:<REGION>:<ACCOUNT_ID>:secret:rds!*"
           }
         ]
       }
       ```
       Replace `<REGION>` and `<ACCOUNT_ID>` with your values. Use `rds!*` to match RDS-generated secrets, or specify your exact secret ARN.
5. **Role name**: `ecsTaskExecutionRole` (or your preferred name)
6. **Create role**

### Required Permissions Summary for Execution Role

The execution role needs:
- **ECR access**: Pull container images (`ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, etc.) - provided by `AmazonECSTaskExecutionRolePolicy`
- **CloudWatch Logs access**: Create log streams and write logs (`logs:CreateLogStream`, `logs:PutLogEvents`) - provided by `AmazonECSTaskExecutionRolePolicy`
- **Secrets Manager access**: Read secrets to inject as environment variables (`secretsmanager:GetSecretValue`, `secretsmanager:DescribeSecret`) - must be added separately

### Task Role (`ecsTaskRole`)

Used by your application running in the container to access AWS services at runtime.

1. Go to **IAM** → **Roles** → **Create role**
2. **Trust entity type**: Custom trust policy
3. **Trust policy** (same as execution role):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Service": "ecs-tasks.amazonaws.com"
         },
         "Action": "sts:AssumeRole"
       }
     ]
   }
   ```
4. **Attach permissions** based on what your app needs:
   - **For RDS access**: No IAM policy needed (RDS uses security groups for network access)
   - **For Secrets Manager** (if app reads secrets at runtime, not just at startup):
     - Create inline policy:
       ```json
       {
         "Version": "2012-10-17",
         "Statement": [
           {
             "Effect": "Allow",
             "Action": [
               "secretsmanager:GetSecretValue"
             ],
             "Resource": "arn:aws:secretsmanager:<REGION>:<ACCOUNT_ID>:secret:your-secret-name-*"
           }
         ]
       }
       ```
   - **For S3**: `AmazonS3ReadOnlyAccess` or custom policy with specific bucket access
   - **For other AWS services**: Attach appropriate policies as needed
5. **Role name**: `ecsTaskRole` (or your preferred name)
6. **Create role**

### Required Permissions Summary for Task Role

The task role needs:
- **Minimal permissions**: For this demo (RDS connection), no IAM policies are required
- **RDS access**: Handled via security groups, not IAM policies
- **Secrets Manager**: Only needed if your application reads secrets at runtime (not just at container startup)
- **Other services**: Add policies based on what your application needs to access

**Note**: For this demo, the task role can have no attached policies if you're only connecting to RDS via security groups.

### Update Task Definition

In `ecs/task-definition.json`, replace `<ACCOUNT_ID>` with your AWS account ID:
- `executionRoleArn`: `arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskExecutionRole`
- `taskRoleArn`: `arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskRole`
---
## 3) Configure ECS task definition
Open: `ecs/task-definition.json`

Replace:
- `<ACCOUNT_ID>` in role ARNs
- set environment variables:
  - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- ensure region matches your setup (default: `eu-west-2`)

Notes:
- For real projects, use **Secrets Manager** instead of plain env vars for passwords.

---
## 4) GitHub Actions configuration
File: `.github/workflows/deploy-ecs.yml`

The workflow uses GitHub Secrets for all configuration values. Make sure you've added all required secrets (see Step 3 in section 2 above):
- `AWS_ROLE_ARN` = your IAM role ARN for GitHub Actions
- `AWS_REGION` = your AWS region (e.g., `eu-west-2`)
- `ECR_REPOSITORY` = your ECR repository name (e.g., `ecs-rds-gha-demo`)
- `ECS_CLUSTER` = your ECS cluster name (e.g., `demo-cluster`)
- `ECS_SERVICE` = your ECS service name (e.g., `demo-service`)

Push to `main` branch to trigger deployment.

---
## 5) Run locally
```bash
cd app
npm install
npm start
```

Visit:
- http://localhost:3000/
- http://localhost:3000/health
- http://localhost:3000/version
- http://localhost:3000/feature

Optional DB check (example):
```bash
export DB_HOST="your-rds-endpoint"
export DB_USER="app"
export DB_PASSWORD="..."
export DB_NAME="appdb"
node server.js
```
Then: http://localhost:3000/db

---

## 5.1) IAM Permissions Quick Reference

### GitHub Actions Role
**Required Policies:**
- `AmazonEC2ContainerRegistryFullAccess` - Push/pull images to ECR
- `AmazonECS_FullAccess` - Register task definitions, update services
- **Inline Policy** (`iam:PassRole`) - Pass ECS task roles to ECS

**Trust Policy:** GitHub OIDC provider (`token.actions.githubusercontent.com`)

### Execution Role (`ecsTaskExecutionRole`)
**Required Policies:**
- `AmazonECSTaskExecutionRolePolicy` - ECR and CloudWatch Logs access
- **Secrets Manager access** (inline or managed):
  - `SecretsManagerReadWrite` (broad), OR
  - Custom inline policy with `GetSecretValue` for specific secrets

**Trust Policy:** `ecs-tasks.amazonaws.com`

### Task Role (`ecsTaskRole`)
**Required Policies:**
- **None** (for basic RDS connection via security groups)
- Add policies only if your app needs to access other AWS services at runtime

**Trust Policy:** `ecs-tasks.amazonaws.com`

### CloudWatch Logs
- Log group must exist before ECS tasks start
- Execution role automatically has permissions via `AmazonECSTaskExecutionRolePolicy`
