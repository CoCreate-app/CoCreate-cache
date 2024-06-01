import socket from "@cocreate/socket-client"

// const cacheName = "dynamic-v2"
const cacheBtn = document.getElementById('cacheBtn');

function putFile(cacheName, data) {
    if (!data.name || !data.pathname || !data.src || !data['content-type'])
        return;

    caches.open(cacheName).then((cache) => {
        cache.keys().then((keys) => {
            let urls = new Map()
            for (const key of keys) {
                const url = new URL(key.url);
                if (url.pathname === data.pathname
                    || url.pathname === '/' && data.pathname === '/index.html'
                    || data.pathname.endsWith('/index.html') && url.pathname + 'index.html' === data.pathname
                    || data.pathname.endsWith('/index.html') && !data.pathname.endsWith('/') && url.pathname + '/index.html' === data.pathname) {
                    if (!data.host || data.host.includes('*') || data.host.some(host => url.origin.includes(host)))
                        urls.set(key.url, true)
                }
            }

            if (!urls.size) return

            for (let fileUrl of urls.keys()) {
                // Create a Response object with the new file data
                let modifiedOn = data.modified.on || data.created.on

                let source = data.src
                if (/^[A-Za-z0-9+/]+[=]{0,2}$/.test(source)) {
                    source = source.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
                    source = atob(source);
                    const binaryData = new Uint8Array(source.length);

                    for (let i = 0; i < source.length; i++) {
                        binaryData[i] = source.charCodeAt(i);
                    }

                    source = new Blob([binaryData], { type: data['content-type'] });
                }

                const fileResponse = new Response(source, {
                    headers: {
                        'Content-Type': data['content-type'],
                        'organization': data.organization_id,
                        'Last-Modified': modifiedOn,
                    }
                });

                // Update the cache with the new version (or add it if not in the cache)
                cache.put(fileUrl, fileResponse).then(() => {
                    // console.log('Cache updated: ', fileUrl, modifiedOn)
                }).catch(error => {
                    console.error(`Cache update error: ${error}`);
                });
            }

        });
    });
}

function deleteCache(cacheName) {
    if ('serviceWorker' in navigator) {
        return caches.delete(cacheName);
    }
}

function deleteFile(cacheName, fileName) {
    if ('serviceWorker' in navigator) {
        caches.open(cacheName).then(function (cache) {
            cache.delete(fileName).then(function (response) {
                return response
            });
        })
    }
}

if (cacheBtn) {
    cacheBtn.addEventListener('click', function () {
        deleteFile('dynamic-v2', '/CoCreate-components/CoCreate-pwa/src/index.js');
    });
}

function fileChange(data) {
    if (window.localStorage.getItem('cache') === 'false')
        return
    if (data.array !== 'files')
        return
    if (!data.object || !data.object.length)
        return
    if (data.sync)
        return

    for (let i = 0; i < data.object.length; i++) {
        // console.log('File change: ', data.method, data.object[i].$storage, data.object[i].name, 'isSync: ', data.isSync, data.object.length)
        putFile('dynamic-v2', data.object[i])
    }
}

if ('serviceWorker' in navigator) {
    socket.listen('object.create', (data) => fileChange(data));
    socket.listen('object.read', (data) => fileChange(data));
    socket.listen('object.update', (data) => fileChange(data));
    socket.listen('object.delete', (data) => fileChange(data));
}

navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data.action === 'checkCache') {
        for (let file of Object.keys(event.data.returnedFromCache)) {
            const url = new URL(file);
            let pathname = url.pathname;

            let { organization, lastModified } = event.data.returnedFromCache[file];
            if (organization && lastModified) {
                if (pathname.endsWith('/'))
                    pathname += 'index.html'

                socket.send({
                    method: 'object.read',
                    array: 'files',
                    $filter: {
                        query: {
                            pathname,
                            'modified.on': { $gt: lastModified }
                        }
                    },
                    status: 'await'
                }).then((data) => {
                    if (data.object && data.object[0]) {
                        console.log('Check cache update: ', pathname, lastModified, data.object[0].modified.on)
                        fileChange(data)
                    }
                })

            } else {
                // TODO: handle files not retuned by @cocreate/file-server using the files header cache stratergy

                // console.log('Send to fetch', { pathname, organization, lastModified })
                // fetch(file)
                //     .then((response) => {
                //         // Handle the response as needed
                //     })
                //     .catch((error) => {
                //         // Handle fetch errors
                //         console.error('Fetch error:', error);
                //     });
            }
        }
    }
});

export default { putFile, deleteFile, deleteCache }