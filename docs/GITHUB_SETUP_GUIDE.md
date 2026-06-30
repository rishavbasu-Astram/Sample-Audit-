# First GitHub Repository Guide

This guide is for this project folder:

```powershell
C:\Users\KIIT\OneDrive\Desktop\Audit
```

The local Git repository has already been created and the first commit has already been made.

## 1. Check The Project Locally

Open PowerShell:

```powershell
cd "C:\Users\KIIT\OneDrive\Desktop\Audit"
npm run lint
npm run type-check
npm run build
```

All three commands should pass before you push changes to GitHub.

## 2. Create A New Repository On GitHub

1. Go to https://github.com
2. Sign in.
3. Click the `+` button in the top-right corner.
4. Click `New repository`.
5. Repository name:

```text
enterprise-financial-management
```

6. Choose `Public` or `Private`.
7. Do not tick `Add a README file`.
8. Do not add a `.gitignore`.
9. Do not choose a license on GitHub.
10. Click `Create repository`.

This project already includes a README, `.gitignore`, and license.

## 3. Connect This Local Project To GitHub

After creating the GitHub repo, GitHub will show you a repository URL.

It will look like this:

```text
https://github.com/YOUR-USERNAME/enterprise-financial-management.git
```

Run these commands in PowerShell:

```powershell
cd "C:\Users\KIIT\OneDrive\Desktop\Audit"
git remote add origin https://github.com/YOUR-USERNAME/enterprise-financial-management.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your real GitHub username.

## 4. Confirm The Upload

Refresh your GitHub repository page.

You should see files like:

```text
README.md
package.json
src/
.github/
```

If you see those, your first repository is live.

## 5. Create Your First GitHub Project Board

1. Open your GitHub repository.
2. Click `Projects`.
3. Click `New project`.
4. Choose `Board`.
5. Name it:

```text
Enterprise Financial Management Roadmap
```

Add these starter tasks:

```text
Build real backend APIs
Add PostgreSQL and Prisma
Add login and RBAC
Connect invoice forms to real data
Add production deployment
Improve mobile responsiveness
```

## 6. Daily Git Workflow

Whenever you make changes:

```powershell
cd "C:\Users\KIIT\OneDrive\Desktop\Audit"
npm run lint
npm run type-check
npm run build
git status
git add .
git commit -m "Describe what changed"
git push
```

Good commit message examples:

```text
Add invoice search filters
Fix audit log table fields
Improve dashboard layout
Add deployment documentation
```

## 7. Important Notes

- Do not upload `node_modules`.
- Do not upload `.env` files.
- Do not upload `.next`.
- The `.gitignore` file already protects those files.
- Keep `package-lock.json` committed because it helps GitHub and deployment platforms install the same dependency versions.

## 8. Optional Deployment Later

For the easiest first deployment, use Vercel:

1. Go to https://vercel.com
2. Sign in with GitHub.
3. Click `Add New Project`.
4. Import this GitHub repository.
5. Keep the default Next.js settings.
6. Click `Deploy`.

Before deploying, always run:

```powershell
npm run build
```
