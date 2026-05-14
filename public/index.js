const form = document.querySelector('form');
const input = document.querySelector('input');

// 1. Register the Service Worker immediately
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/uv/uv.sw.js', {
            scope: __uv$config.prefix
        }).then(() => {
            console.log('Service Worker registered successfully');
        }).catch((err) => {
            console.error('Service Worker registration failed:', err);
        });
    });
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    let url = input.value.trim();
    
    // Check if it's a search term or a URL
    if (!url.includes('.') || url.includes(' ')) {
        // Use DuckDuckGo for searches
        url = 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
    } else if (!(url.startsWith('https://') || url.startsWith('http://'))) {
        url = 'https://' + url;
    }

    // Set the location to the Ultraviolet prefixed URL
    // This encodes the URL so filters don't see "duckduckgo.com"
    window.location.href = __uv$config.prefix + __uv$config.encodeUrl(url);
});
