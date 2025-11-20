"""
Earth-Viz Setup Script
Downloads static image files after package installation
"""

import httpx
import tarfile
import io
from pathlib import Path
import sys


def download_static_files():
    """Download static planet images and monthly earth textures from GitHub release"""
    
    # Download to user's home directory
    static_dir = Path.home() / ".earth_viz" / "static_images"
    
    print("=" * 60)
    print("Earth-Viz Static Files Setup")
    print("=" * 60)
    print(f"\nDownload location: {static_dir}")
    print("\nThis will download ~100MB of high-resolution planet textures.")
    print("This only needs to be done once after installation.\n")
    
    # Check if already downloaded
    marker_file = static_dir / ".download_complete"
    if marker_file.exists():
        print("✓ Static files already downloaded!")
        print(f"  Location: {static_dir}")
        print("\nTo re-download, delete the static_images folder and run this again.")
        return
    
    # TODO: Update this URL when you create the GitHub release
    url = "https://github.com/edcatley/earth/releases/latest/download/static_images.tar.gz"

    
    print("Downloading static files archive...")
    print("This may take a few minutes depending on your connection.\n")
    
    try:
        # Create temp file for download
        import tempfile
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.tar.gz')
        temp_path = temp_file.name
        
        try:
            # Download the tar.gz file directly to disk
            with httpx.stream("GET", url, follow_redirects=True, timeout=600.0) as response:
                response.raise_for_status()
                
                total = int(response.headers.get("content-length", 0))
                downloaded = 0
                
                print("Downloading...")
                for chunk in response.iter_bytes(chunk_size=1024*1024):  # 1MB chunks
                    temp_file.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        percent = (downloaded / total) * 100
                        mb_downloaded = downloaded / (1024 * 1024)
                        mb_total = total / (1024 * 1024)
                        print(f"\r  Progress: {percent:.1f}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)", end="", flush=True)
                print()  # New line
            
            temp_file.close()
            
            print("\nExtracting files...")
            
            # Extract with streaming iterator (doesn't load all members into memory)
            with tarfile.open(temp_path, mode="r|gz") as tar:  # Note: r|gz for streaming
                count = 0
                for member in tar:
                    tar.extract(member, static_dir.parent)
                    count += 1
                    if count % 10 == 0:
                        print(f"\r  Extracted {count} files...", end="", flush=True)
                print(f"\r  Extracted {count} files total")  # Final count
        
        finally:
            # Clean up temp file
            import os
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        
        # Mark as complete
        marker_file.touch()
        
        print("\n" + "=" * 60)
        print("✓ Setup complete!")
        print("=" * 60)
        print(f"\nStatic files installed to: {static_dir}")
        print("You can now run earth-viz.\n")
        
    except httpx.HTTPStatusError as e:
        print(f"\n✗ Download failed: {e}", file=sys.stderr)
        print("\nThe static files release may not exist yet.", file=sys.stderr)
        print("Please check: https://github.com/edcatley/earth/releases\n", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Setup failed: {e}", file=sys.stderr)
        print("\nPlease check your internet connection and try again.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    download_static_files()
