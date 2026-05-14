const form = document.getElementById('proxy-form');
const input = document.getElementById('url-input');

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/uv/uv.sw.js', {
            scope: __uv$config.prefix
        }).catch(err => console.error('SW Error:', err));
    });
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    let url = input.value.trim();
    
    if (!url) return;

    // DuckDuckGo Search Logic
    if (!url.includes('.') || url.includes(' ')) {
        url = 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
    } else if (!(url.startsWith('https://') || url.startsWith('http://'))) {
        url = 'https://' + url;
    }

    // Check if UV is loaded
    if (typeof __uv$config === 'undefined') {
        alert("Proxy engine not loaded. Check if /uv/ scripts are in your public folder.");
        return;
    }

    // Redirect
    window.location.href = __uv$config.prefix + __uv$config.encodeUrl(url);
});
