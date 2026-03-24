![Naraseo AI Logo](./Logo.png)

# Distribution Package - Ready for Download

Your Naraseo AI extension is now packaged for direct distribution. **No Chrome Store approval needed.**

---

## 📦 Files to Distribute

### For Users to Download:

1. **README.md** — Overview & quick start guide
2. **INSTALL.md** — Step-by-step installation
3. **extension/** folder (or naraseo-ai-extension.tar.gz)
4. **docker-compose.yml** + **Dockerfile** + **backend/** folder
5. **.env.example** — Template for API keys

### Compressed Package:
- **naraseo-ai-extension.tar.gz** (90KB) — Just the extension

---

## 🎯 Distribution Scenarios

### Scenario A: Self-Hosted (Best for Control)

Users get:
1. Extension folder (via GitHub or direct download)
2. Backend setup instructions
3. They run `docker-compose up` for backend

**Link them to**: README.md → INSTALL.md

---

### Scenario B: GitHub Release

1. Create a repo `naraseo-ai-extension`
2. Upload release with:
   - `naraseo-ai-extension.tar.gz`
   - README.md
   - INSTALL.md
   - Dockerfile + docker-compose.yml
3. Users download, extract, load in Chrome

---

### Scenario C: Website Download

1. Host `naraseo-ai-extension.tar.gz` on your website
2. Add button: "Download for Chrome"
3. Link to INSTALL.md for setup steps

---

## ✅ Deployment Checklist

Before distributing:

- [ ] Backend `.env` contains valid API keys
- [ ] Extension `manifest.json` hardcoded URLs point to `http://localhost:3001`
- [ ] All icons present in `extension/icons/`
- [ ] README.md explains features
- [ ] INSTALL.md has clear steps
- [ ] Docker tested: `docker-compose up` works
- [ ] Node.js also tested: `cd backend && npm install && node server.js`

---

## 🔄 Update Instructions

When you release a new version:

1. **Version bump**:
   ```json
   // extension/manifest.json
   "version": "1.0.1"
   ```

2. **Repackage**:
   ```bash
   tar --exclude=".git*" --exclude="node_modules" -czf "naraseo-ai-extension.tar.gz" extension/
   ```

3. **Release on GitHub/Website** with changelog

4. **Users update**: Delete old extension from `chrome://extensions`, reload new version

---

## 📊 Analytics & Usage

Currently no analytics built-in. To track:
- Add `chrome.storage.local` tracking for audit counts (already done)
- Send usage to backend database (optional)
- Consider privacy: users may not want tracking

---

## 💰 Monetization Options

1. **Free tier limits** (already implemented)
   - 5 audits/month free
   - Pro: unlimited

2. **Stripe integration** (TODO)
   - Add checkout in extension
   - Backend validates plan on API calls

3. **Self-hosted license keys** (alternative to Stripe)
   - Generate keys per customer
   - Validate against backend

---

## 🚨 Important Notes

- **Backend must run locally** on port 3001 (for now)
- **API keys** (Anthropic, Google) needed in `.env`
- **No automatic updates** — users manually reload in `chrome://extensions`
- **Developer mode required** — users see "This extension is not from Chrome Web Store" (normal for unpacked extensions)

---

## Next Steps

1. **Test everything**:
   ```bash
   # In separate terminals:
   cd backend && npm install && node server.js
   # Then load extension from chrome://extensions
   ```

2. **Host files**:
   - GitHub Releases (recommended)
   - Your website
   - S3 bucket
   - Direct link

3. **Share with users**:
   - Link to README.md
   - Emphasize: "No installation required, just unzip & load in Chrome"
   - Include support email

---

**Your extension is ready to ship! 🚀**
