export function Supports() {
  const apps = [
    {
      name: "Google Meet",
      src: "/google-meet.svg",
      width: 39,
      height: 32,
    },
    {
      name: "MS Teams",
      src: "/teams.svg",
      width: 30,
      height: 32,
    },
    {
      name: "Zoom",
      src: "/zoom.png",
      width: 32,
      height: 32,
    },
    {
      name: "Slack",
      src: "/slack.png",
      width: 32,
      height: 32,
    },
    {
      name: "Discord",
      src: "/discord.svg",
      width: 41,
      height: 32,
    },
    {
      name: "Webex",
      src: "/webex.png",
      width: 44,
      height: 32,
    },
  ] as const;

  return (
    <section className="w-full select-none border-zinc-200/50 border-t bg-bg py-10">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="flex flex-col items-center">
          <span className="mb-8 font-mono text-[10px] text-zinc-400 uppercase tracking-[0.25em]">
            supports
          </span>
          <div className="flex w-full flex-wrap items-center justify-center gap-x-8 gap-y-6 md:gap-x-14">
            {apps.map((app) => (
              <div
                className="group flex cursor-pointer items-center justify-center"
                key={app.name}
              >
                {/* biome-ignore lint/performance/noImgElement: not a Next.js project */}
                <img
                  alt={app.name}
                  className="h-8 w-auto object-contain opacity-90 transition-all duration-300 group-hover:scale-105 group-hover:opacity-100"
                  height={app.height}
                  src={app.src}
                  width={app.width}
                />
              </div>
            ))}
          </div>
          <p className="mt-8 font-body font-medium text-xs text-zinc-400">
            ...and any other meeting app
          </p>
        </div>
      </div>
    </section>
  );
}
