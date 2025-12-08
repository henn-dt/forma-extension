# =============================================================================
# Azure Container Apps Setup Script
# =============================================================================
# This script creates all the Azure resources needed to deploy your
# Forma Tree Detection application.
#
# Prerequisites:
# 1. Azure CLI installed: https://docs.microsoft.com/cli/azure/install-azure-cli
# 2. Logged in to Azure: az login
# 3. Docker images pushed to GHCR (run GitHub Actions first)
#
# Usage:
#   .\scripts\setup-azure.ps1
# =============================================================================

# Configuration - CHANGE THESE VALUES
$RESOURCE_GROUP = "forma-rg"
$LOCATION = "westeurope"  # Choose: westeurope, eastus, westus2, etc.
$CONTAINER_ENV = "forma-env"
$GITHUB_USERNAME = "ABCHai25"  # Your GitHub username (lowercase)

# Image names
$BACKEND_IMAGE = "ghcr.io/$GITHUB_USERNAME/forma-backend:latest"
$PYTHON_IMAGE = "ghcr.io/$GITHUB_USERNAME/forma-python:latest"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Azure Container Apps Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if logged in
Write-Host "Checking Azure login status..." -ForegroundColor Yellow
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Not logged in. Running 'az login'..." -ForegroundColor Yellow
    az login
}
Write-Host "Logged in as: $($account.user.name)" -ForegroundColor Green
Write-Host ""

# Create Resource Group
Write-Host "Creating Resource Group: $RESOURCE_GROUP..." -ForegroundColor Yellow
az group create `
    --name $RESOURCE_GROUP `
    --location $LOCATION `
    --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Resource Group created" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to create Resource Group" -ForegroundColor Red
    exit 1
}

# Create Container Apps Environment
Write-Host "Creating Container Apps Environment: $CONTAINER_ENV..." -ForegroundColor Yellow
Write-Host "(This may take 2-3 minutes...)" -ForegroundColor Gray

az containerapp env create `
    --name $CONTAINER_ENV `
    --resource-group $RESOURCE_GROUP `
    --location $LOCATION `
    --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Container Apps Environment created" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to create Container Apps Environment" -ForegroundColor Red
    exit 1
}

# Create Python API Container App (Internal)
Write-Host "Creating Python API Container App..." -ForegroundColor Yellow

az containerapp create `
    --name forma-python `
    --resource-group $RESOURCE_GROUP `
    --environment $CONTAINER_ENV `
    --image $PYTHON_IMAGE `
    --target-port 5001 `
    --ingress internal `
    --min-replicas 0 `
    --max-replicas 3 `
    --cpu 0.5 `
    --memory 1.0Gi `
    --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Python API Container App created" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to create Python API Container App" -ForegroundColor Red
    exit 1
}

# Create Backend Container App (External)
Write-Host "Creating Backend Container App..." -ForegroundColor Yellow

az containerapp create `
    --name forma-backend `
    --resource-group $RESOURCE_GROUP `
    --environment $CONTAINER_ENV `
    --image $BACKEND_IMAGE `
    --target-port 3001 `
    --ingress external `
    --min-replicas 0 `
    --max-replicas 3 `
    --cpu 0.5 `
    --memory 1.0Gi `
    --env-vars "PYTHON_API_URL=http://forma-python:5001" "NODE_ENV=production" `
    --output none

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Backend Container App created" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to create Backend Container App" -ForegroundColor Red
    exit 1
}

# Get the Backend URL
Write-Host ""
Write-Host "Getting deployment URL..." -ForegroundColor Yellow

$BACKEND_URL = az containerapp show `
    --name forma-backend `
    --resource-group $RESOURCE_GROUP `
    --query "properties.configuration.ingress.fqdn" `
    --output tsv

# Get environment domain
$ENV_DOMAIN = az containerapp env show `
    --name $CONTAINER_ENV `
    --resource-group $RESOURCE_GROUP `
    --query "properties.defaultDomain" `
    --output tsv

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "✓ DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend URL: https://$BACKEND_URL" -ForegroundColor Cyan
Write-Host ""
Write-Host "Environment Domain: $ENV_DOMAIN" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Add environment variables in Azure Portal or with:" -ForegroundColor White
Write-Host "   az containerapp update --name forma-backend -g $RESOURCE_GROUP --set-env-vars 'SESSION_SECRET=your-secret'" -ForegroundColor Gray
Write-Host ""
Write-Host "2. For GitHub Actions, add these secrets to your repo:" -ForegroundColor White
Write-Host "   AZURE_RESOURCE_GROUP = $RESOURCE_GROUP" -ForegroundColor Gray
Write-Host "   AZURE_CONTAINER_ENV = $CONTAINER_ENV" -ForegroundColor Gray
Write-Host "   AZURE_CONTAINER_ENV_DOMAIN = $ENV_DOMAIN" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Create Azure Service Principal for GitHub Actions:" -ForegroundColor White
Write-Host "   az ad sp create-for-rbac --name 'forma-github-actions' --role contributor --scopes /subscriptions/{sub-id}/resourceGroups/$RESOURCE_GROUP --sdk-auth" -ForegroundColor Gray
Write-Host ""
