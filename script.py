import urllib.request, re
req = urllib.request.Request('https://unsplash.com/photos/K485H6uM5e8', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
print(re.search(r'og:image.*?content=.(.*?).>', html).group(1))
