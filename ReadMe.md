## Resources

* [Factory Images for Nexus and Pixel Devices](https://developers.google.com/android/images)
* [Full OTA Images for Nexus and Pixel Devices](https://developers.google.com/android/ota)
* [Driver Binaries for Nexus and Pixel Devices](https://developers.google.com/android/drivers)

## Firmware Browser

A static GitHub Pages site lets you browse firmware by device, type, and version:

> **[Open Firmware Browser →](https://YOUR_USERNAME.github.io/YOUR_REPO/)**  
> *(replace with your actual GitHub Pages URL after enabling Pages)*

### Setup

1. **Enable GitHub Pages**: Settings → Pages → Source = *Deploy from a branch* → Branch: `gh-pages` / `(root)`
2. **Add `RELEASE_TOKEN` secret**: a Personal Access Token with `repo` scope.  
   This is required for the nightly URL-list update (`update-url-lists.yml`) to automatically
   trigger a site rebuild. Without it, pushes from that workflow use `GITHUB_TOKEN` and GitHub
   will not fire downstream workflows. A manual `workflow_dispatch` on **Build and Deploy Firmware Browser**
   is always available as a fallback.

### Rebuilding manually

Run the **Build and Deploy Firmware Browser** workflow from the Actions tab.
