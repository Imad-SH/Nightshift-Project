import re
import os

path = r'c:\Users\imads\Desktop\Web App\src\components\GraphVisualizer.tsx'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Regex to find the multi-line OPEN PORTS label and collapse it
    pattern = r'<span className="text-\[10px\] font-mono font-bold text-slate-400 uppercase tracking-widest pl-0.5 whitespace-nowrap">OPEN PORTS :\s+</span>'
    replacement = r'<span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest pl-0.5 whitespace-nowrap">OPEN PORTS :</span>'
    
    new_content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
    
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Successfully updated GraphVisualizer.tsx")
    else:
        print("No changes needed or pattern not found")
else:
    print(f"File not found: {path}")
