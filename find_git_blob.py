import os
import zlib

git_dir = '.git/objects'
for root, dirs, files in os.walk(git_dir):
    if 'pack' in root or 'info' in root:
        continue
    for f in files:
        blob_path = os.path.join(root, f)
        try:
            with open(blob_path, 'rb') as bf:
                data = zlib.decompress(bf.read())
                if b'TRANSFER FUNDS MODULE (Phase 1)' in data and b'filterBucketsForTransferDest' in data:
                    content = data.split(b'\x00', 1)[1]
                    with open('src/pages/transfer_original.js', 'wb') as out:
                        out.write(content)
                    print(f"Found original in {blob_path} with len {len(content)}")
                    exit(0)
        except Exception as e:
            pass

print("Could not find blob")
