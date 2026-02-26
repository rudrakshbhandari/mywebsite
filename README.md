# Rudraksh Bhandari - Portfolio Website

A modern, responsive portfolio website showcasing my projects, experience, and skills as a Computer Science student at UC San Diego.

## 🚀 Live Website

Visit: [rudrakshbhandari.com](https://rudrakshbhandari.com)

## ✨ Features

- **Modern Design**: Clean, professional layout with smooth animations
- **Responsive**: Mobile-first design that works on all devices
- **Fast Loading**: Optimized performance with minimal dependencies
- **Accessible**: Semantic HTML and proper ARIA labels
- **SEO Optimized**: Proper meta tags and structured data

## 🛠️ Technologies Used

- **HTML5**: Semantic markup and accessibility features
- **CSS3**: Modern CSS with Grid, Flexbox, and custom properties
- **JavaScript**: Vanilla JS for interactions and animations
- **Font Awesome**: Icons for social links and UI elements
- **Google Fonts**: Inter font family for typography

## 📁 Project Structure

```
├── index.html          # Main HTML file
├── css/
│   └── styles.css     # Custom CSS styles
├── js/
│   └── main.js        # JavaScript functionality
├── img/
│   ├── Rudraksh-1.JPG   # Profile photo
│   └── ShareAllBooks.jpg # Project image
└── README.md          # This file
```

## 🎯 Sections

- **Hero**: Introduction with profile photo and current status
- **About**: Personal background and achievements
- **Experience**: Professional timeline with Amazon AWS internship and other roles
- **Projects**: Technical projects with detailed descriptions
- **Skills**: Technologies and tools I work with
- **Contact**: Contact information and social links

## 🚀 Deployment

This website is deployed using GitHub Pages with a custom domain. The site automatically updates when changes are pushed to the main branch.

## 📝 Development

### Code Formatting

The project uses Prettier for code formatting:

```bash
npm run format        # Format all files
npm run format:check  # Check formatting
npm run format:html   # Format HTML files only
```

## Git Workflow Requirements

### Hard rule: never commit directly to main

**Agents must never commit directly to `main`.** All changes go through feature branches and pull requests.

Required flow for any code change:

1. **Create a feature branch with a name that matches the task** (e.g. `rudrakshbhandari/grant-admin-script` for grant-admin work, not `rudrakshbhandari/some-other-task`). Branch name must describe the work.
2. Make changes and commit on the branch
3. **Push the branch** to origin
4. **Open a PR** targeting `main`
5. Inform user: `Branch pushed. PR: <url>`

Do not skip the branch. Do not push to `main` from the agent. **Do not commit to an existing branch if the branch name does not match the current task**—create a new appropriately named branch instead.

---

### Hard rule: always commit and push immediately after edits

**Do not leave uncommitted changes.** After making any code or doc edits, agents must commit and push in the **same response**—without waiting for the user to ask. Treat this as automatic; the user should never have to say "commit" or "push" to get changes persisted to the branch.

Pre-edit gate (must run before any file edit command):

1. Run `git rev-parse --abbrev-ref HEAD`.
2. If branch is `main`, STOP and create a task branch first: `git checkout -b rudrakshbhandari/<task>`.
3. If branch name does not match the task, STOP and create the correct branch.
4. Only then edit files.

If an agent edits files while on `main`, it must immediately:

1. Create the correct task branch.
2. Keep the edits (do not discard user work).
3. Commit, push, and open a PR in the same response.
4. Explicitly report the mistake and the corrective action taken.

Process (execute as soon as edits are done):

1. Ensure you are on a branch whose name matches the task. If not, create one: `git checkout -b rudrakshbhandari/<task>` (from `main` or the correct base).
2. `git status` / `git diff`
3. `git add <changed-files>` (exclude build artifacts, coverage dirs, `.env`)
4. `git commit -m "type: description"`
5. `git push origin <branch>`
6. Open PR (or inform user if PR already exists)

**After any code change on a branch, always commit** using conventional commits.

Conventional examples:

- `feat: add Google sign-in with @ucsd.edu validation`
- `fix: correct order total calculation with tip`
- `refactor: extract order form to separate component`
- `docs: update Firebase setup guide`
- `chore: update dependencies`

## 📋 TODO / Future Improvements

### High Priority

- [x] Update Psyches of Color GitHub repository link with actual repo URL
- [ ] Create and add OG image (`img/og-cover.jpg`) for social sharing (1200x630px)
- [ ] Add favicon file (`favicon.ico`) to root directory

### Content Enhancements

- [ ] Add case study page for NomNom with architecture diagram and demo video
- [ ] Add press/testimonials strip for ShareAllBooks showcasing press coverage
- [ ] Update project GitHub links with actual repository URLs when available

### Feature Additions

- [ ] Implement dark mode with `prefers-color-scheme` support
- [ ] Add changelog or blog section for ongoing work and updates
- [ ] Consider adding analytics tracking (e.g., Cloudflare Web Analytics) for recruiter traffic

### Performance & Optimization

- [ ] Convert images to next-gen formats (WebP/AVIF) with JPG fallbacks
- [ ] Consider adding a contact form to Contact section
- [ ] Optimize and minify CSS/JS for production

### Accessibility & SEO

- [ ] Add Content Security Policy headers when deploying on Vercel
- [ ] Test and verify all accessibility features with screen readers
- [ ] Update sitemap.xml lastmod dates when making content changes

## 📧 Contact

- **Email**: rubhandari@ucsd.edu
- **LinkedIn**: [rudrakshbhandari](https://www.linkedin.com/in/rudrakshbhandari)
- **GitHub**: [rudrakshbhandari](https://github.com/rudrakshbhandari)

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
