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
    
    // Basic helper to turn search terms into Google searches
    if (!url.includes('.') || url.includes(' ')) {
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
    } else if (!(url.startsWith('https://') || url.startsWith('http://'))) {
        url = 'https://' + url;
    }

    // Set the location to the Ultraviolet prefixed URL
    window.location.href = __uv$config.prefix + __uv$config.encodeUrl(url);
});
