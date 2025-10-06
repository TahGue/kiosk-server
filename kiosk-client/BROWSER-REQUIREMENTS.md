# Browser Requirements for Kiosk Client

## Why Firefox is Required

Your kiosk displays a **Next.js application with Tailwind CSS**, which requires a modern browser with full support for:

- **ES6+ JavaScript** (modern syntax)
- **CSS Grid & Flexbox** (Tailwind uses these extensively)
- **Modern DOM APIs** (React/Next.js requirements)
- **WebSocket support** (for real-time updates)
- **Service Workers** (Next.js features)

## Browser Compatibility

### ✅ Firefox (Recommended)
- **Fully supports** Next.js and Tailwind CSS
- **Works on 2GB RAM** (though slower)
- **Best for antiX 386** old hardware
- **Pre-installed** on most Linux distributions

### ✅ Google Chrome
- **Fully supports** Next.js and Tailwind CSS
- **Requires more RAM** (3-4GB minimum)
- **Not recommended** for antiX 386 with 2GB RAM
- **Fallback option** if Firefox unavailable

### ❌ Midori (Not Supported)
- **Cannot render** modern JavaScript frameworks
- **Missing APIs** required by React/Next.js
- **CSS issues** with Tailwind CSS
- **Will break** your kiosk application

## Performance on 2GB RAM

### What to Expect with Firefox on antiX 386:

**Pros:**
- ✅ Will work correctly
- ✅ Renders Tailwind CSS properly
- ✅ Handles Next.js without issues
- ✅ Supports all modern web features

**Cons:**
- ⚠️ Slower page load times (3-5 seconds)
- ⚠️ Occasional lag with heavy animations
- ⚠️ Higher memory usage (1-1.5GB)

### Optimization Tips:

1. **On the client side (antiX):**
   - Disable unnecessary services
   - Use lightweight window manager (antiX default)
   - Close all other applications
   - Disable browser extensions

2. **On your Next.js app:**
   - Minimize heavy animations
   - Optimize images (use Next.js Image component)
   - Use lazy loading for components
   - Enable Next.js production mode
   - Use server-side rendering (already default)

3. **Consider hardware upgrade:**
   - **4GB RAM** = Smooth performance
   - **8GB RAM** = Excellent performance
   - But **2GB will work** for basic kiosk needs

## Script Behavior

The kiosk setup script will:

1. **Detect available browsers** in this order:
   - Firefox (preferred)
   - Chrome (fallback)
   - Error if neither found

2. **Install Firefox** if not present:
   ```bash
   apt-get install -y firefox || apt-get install -y firefox-esr
   ```

3. **Log warnings** on low RAM:
   ```
   WARN: Only 2048MB RAM detected. Firefox may be slow. 
   Consider upgrading to 4GB RAM for better performance.
   ```

4. **Proceed anyway** because modern web apps require modern browsers

## Testing Your App on 2GB RAM

To test if your Next.js app works well on 2GB RAM:

1. **Open Firefox on the antiX machine**
2. **Navigate to your kiosk URL**
3. **Check for issues:**
   - Slow loading? → Optimize images and code
   - Layout broken? → Check Tailwind CSS (should work fine)
   - JavaScript errors? → Check browser console
   - Memory warnings? → Reduce animations

4. **Monitor performance:**
   ```bash
   # Check memory usage
   free -h
   
   # Check Firefox process
   ps aux | grep firefox
   
   # Check kiosk logs
   tail -f /var/log/kiosk-client.log
   ```

## Alternative Solutions

If 2GB RAM is too limiting:

### Option 1: Upgrade RAM (Recommended)
- **Cost:** $20-40 for 4GB DDR3 RAM
- **Benefit:** Smooth performance
- **Best solution** for long-term use

### Option 2: Simplify Your App
- Remove heavy animations
- Use static images instead of dynamic content
- Reduce JavaScript bundle size
- Use simpler Tailwind components

### Option 3: Server-Side Rendering Only
- Disable client-side JavaScript
- Use Next.js SSR/SSG only
- Serve static HTML pages
- Minimal browser requirements

## Conclusion

**Firefox is required** for your Tailwind CSS + Next.js kiosk application, even on 2GB RAM systems. While performance may not be optimal, it will work correctly. Midori and other lightweight browsers cannot handle modern web frameworks and will break your application.

The kiosk scripts have been configured to:
- ✅ Always prefer Firefox
- ✅ Warn about low RAM but proceed
- ✅ Never use Midori for modern web apps
- ✅ Provide fallback to Chrome if needed
