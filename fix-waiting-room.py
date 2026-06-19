import re

with open("apps/desktop/src/routes/meeting/waiting-room.tsx", "r") as f:
    content = f.read()

# 1. Root container
content = content.replace(
    'className="fixed inset-0 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans text-[#E8E8ED]"',
    'className="absolute inset-0 flex flex-col overflow-hidden bg-bg pt-9 text-fg"'
)

# 2. Header
content = content.replace(
    'className="relative z-10 flex w-full items-center justify-between border-[rgba(255,255,255,0.05)] border-b bg-[rgba(10,10,11,0.8)] p-6 backdrop-blur-md"',
    'className="relative z-10 flex w-full items-center justify-between border-border border-b bg-bg/80 p-6 backdrop-blur-md"'
)
content = content.replace('text-white', 'text-fg')

# 3. Text colors
content = content.replace('text-[#8A8A93]', 'text-fg-subtle')
content = content.replace('text-[#E8E8ED]', 'text-fg')
content = content.replace('text-[#A1A1A6]', 'text-fg-muted')

# 4. Backgrounds & Borders
content = content.replace('bg-[rgba(20,20,22,0.4)]', 'bg-bg-elevated')
content = content.replace('border-[rgba(255,255,255,0.03)]', 'border-border')
content = content.replace('border-[rgba(255,255,255,0.05)]', 'border-border-subtle')
content = content.replace('bg-[rgba(255,255,255,0.02)]', 'bg-bg-subtle')
content = content.replace('bg-[rgba(255,255,255,0.1)]', 'bg-bg-emphasis')
content = content.replace('bg-[rgba(10,10,12,0.6)]', 'bg-bg-elevated/60')
content = content.replace('bg-[rgba(0,0,0,0.2)]', 'bg-bg-subtle')
content = content.replace('border-[rgba(255,255,255,0.1)]', 'border-border')
content = content.replace('hover:bg-[rgba(255,255,255,0.04)]', 'hover:bg-bg-subtle/80')
content = content.replace('scrollbar-thumb-[rgba(255,255,255,0.1)]', 'scrollbar-thumb-border-strong')

with open("apps/desktop/src/routes/meeting/waiting-room.tsx", "w") as f:
    f.write(content)

