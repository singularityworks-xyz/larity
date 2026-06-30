export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const panelClass =
  "rounded-[var(--radius-panel)] border border-border bg-bg-elevated px-5 py-4";

export const heroCardClass = cx(
  panelClass,
  "flex items-start justify-between gap-4"
);

export const eyebrowClass =
  "m-0 text-[11px] font-medium leading-[1.45] text-accent";

export const heroTitleClass =
  "my-[0.15rem] text-xl font-semibold leading-tight tracking-normal text-fg";

export const heroSubtitleClass =
  "m-0 text-xs font-medium leading-normal text-fg-muted";

export const headerActionsClass = "flex items-center gap-2";

export const formClass = "grid gap-3 [&>button]:mt-1";

export const formGroupClass = "grid gap-1";

export const labelClass =
  "block text-[11px] font-medium leading-[1.45] text-fg-muted";

const fieldClass =
  "w-full rounded-[var(--radius-button)] border border-border bg-bg-elevated px-2.5 font-sans text-[13px] font-medium text-fg transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:shadow-[0_0_0_1px_var(--accent)]";

export const inputClass = cx(fieldClass, "h-7 min-h-7");

export const textareaClass = cx(fieldClass, "min-h-22 resize-y py-2");

export const selectClass = cx(fieldClass, "h-7 min-h-7 cursor-pointer");

export const errorInputClass =
  "border-danger-fg focus:shadow-[0_0_0_1px_var(--danger-fg)]";

export const formErrorClass = "m-0 text-[11px] font-medium text-danger-fg";

export const successTextClass = "mt-2 mb-0 text-xs font-medium text-success-fg";

export const controlRowClass = "flex flex-wrap gap-2";

const buttonBaseClass =
  "inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-button)] border-0 px-3 font-sans text-xs font-medium leading-none no-underline transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] disabled:cursor-not-allowed disabled:bg-bg-overlay disabled:text-fg-subtle disabled:opacity-100";

const buttonVariants = {
  danger:
    "bg-danger text-white hover:not-disabled:brightness-110 active:not-disabled:brightness-95",
  ghost:
    "bg-transparent text-fg hover:not-disabled:bg-bg-overlay active:not-disabled:bg-bg-elevated",
  link: "h-auto rounded-none bg-transparent p-0 text-accent hover:not-disabled:underline disabled:bg-transparent",
  primary:
    "bg-accent text-accent-fg hover:not-disabled:brightness-110 active:not-disabled:brightness-95",
  secondary:
    "border border-border bg-bg-overlay text-fg hover:not-disabled:border-border-strong hover:not-disabled:bg-bg-elevated active:not-disabled:bg-bg-overlay",
} as const;

const buttonSizes = {
  lg: "h-8 px-4 text-[13px]",
  md: "h-7 px-3 text-xs",
  sm: "h-6 px-2 text-[11px]",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function buttonClass({
  block = false,
  icon = false,
  size = "md",
  variant = "primary",
}: {
  block?: boolean;
  icon?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
} = {}): string {
  return cx(
    buttonBaseClass,
    buttonVariants[variant],
    buttonSizes[size],
    block && "w-full",
    icon && "w-7 px-0"
  );
}

export const ssoButtonClass = cx(
  buttonClass({ size: "lg", variant: "secondary" }),
  "gap-2.5 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
);

export const authSplitRootClass =
  "flex h-screen min-h-0 w-screen flex-row overflow-hidden bg-bg";

export const authBrandPanelClass =
  "relative hidden h-full min-h-0 basis-[42%] flex-col overflow-hidden border-border border-r bg-bg-elevated md:flex";

export const authFormPanelClass =
  "flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-bg pt-9";

export const authBrandInnerClass =
  "relative z-[1] flex h-full min-h-0 flex-col justify-end px-6 pt-[100px] pb-10 md:px-9";

export const authBrandBgClass =
  "absolute inset-0 z-0 animate-[brandPulse_8s_ease-in-out_infinite_alternate] bg-[radial-gradient(ellipse_at_30%_20%,rgba(0,0,0,0.05)_0%,transparent_55%),radial-gradient(ellipse_at_70%_75%,rgba(0,0,0,0.03)_0%,transparent_50%)] dark:bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,255,255,0.28)_0%,transparent_55%),radial-gradient(ellipse_at_70%_75%,rgba(200,200,200,0.18)_0%,transparent_50%)]";

export const authBrandLogoClass = "mb-4 flex items-center gap-3";

export const authBrandLogoImageClass =
  "drop-shadow-[0_0_16px_rgba(0,0,0,0.1)] invert dark:drop-shadow-[0_0_16px_rgba(255,255,255,0.5)] dark:invert-0";

export const authBrandWordmarkClass =
  "font-['Share_Tech_Mono','Courier_New',monospace] text-lg font-normal tracking-[0.2em] text-fg [text-shadow:0_0_24px_rgba(0,0,0,0.1),0_0_6px_rgba(0,0,0,0.05)] dark:[text-shadow:0_0_24px_rgba(255,255,255,0.4),0_0_6px_rgba(255,255,255,0.15)]";

export const authBrandTaglineClass =
  "mt-0 mb-8 text-xs font-medium leading-normal tracking-[0.04em] text-fg-muted";

export const authBrandFeaturesClass =
  "m-0 flex list-none flex-col gap-2.5 p-0 [&_li]:relative [&_li]:pl-4 [&_li]:text-xs [&_li]:font-medium [&_li]:leading-normal [&_li]:text-fg-muted [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[7px] [&_li]:before:h-px [&_li]:before:w-[5px] [&_li]:before:bg-border-strong [&_li]:before:content-['']";

export const authFormInnerClass =
  "mx-auto w-full max-w-[340px] px-4 pt-10 pb-8 sm:px-6 sm:pt-12 sm:pb-10 lg:my-auto lg:pt-8 lg:pb-12";

export const authBackClass =
  "mb-5 inline-flex items-center gap-1 text-xs font-medium text-fg-muted no-underline transition-colors duration-150 hover:text-fg [&_svg]:h-3.5 [&_svg]:w-3.5";

export const authFormHeaderClass = "mb-6";

export const authFormTitleClass =
  "mt-1 mb-0 text-lg font-semibold leading-snug tracking-normal text-fg";

export const ssoGroupClass = "mb-4 grid gap-2";

export const dividerClass =
  "my-4 flex items-center gap-3 before:flex-1 before:border-border-subtle before:border-t before:content-[''] after:flex-1 after:border-border-subtle after:border-t after:content-['']";

export const dividerLabelClass =
  "whitespace-nowrap text-[11px] font-medium leading-[1.45] text-fg-subtle";

export const authSwitchClass =
  "mt-4 text-center text-xs font-medium leading-normal text-fg-muted [&_a]:font-medium [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline";

/** Full-width horizontal row for segment buttons. */
export const segmentControlLayoutClass = "flex w-full min-w-0";

/** Border, radius, and clipping for paired segment buttons. */
export const segmentControlChromeClass =
  "overflow-hidden rounded-[var(--radius-button)] border border-border";

export const segmentControlClass = cx(
  segmentControlLayoutClass,
  segmentControlChromeClass
);

/** Shared frame for segment toggles (pair with idle or active appearance). */
export const segmentButtonClass =
  "h-7 min-w-0 flex-1 cursor-pointer rounded-none border-0 px-3 font-sans text-xs font-medium transition-[background-color,color,box-shadow] duration-150 ease-out";

/** Unselected segment: muted label, light hover wash. */
export const segmentButtonIdleClass =
  "bg-transparent text-fg-muted hover:not-disabled:bg-bg-subtle/50 hover:not-disabled:text-fg";

/** Selected segment: lifted surface and inset edge. */
export const segmentButtonActiveClass =
  "bg-bg-subtle text-fg font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)] hover:not-disabled:bg-bg-emphasis";

export const permissionStatusClass =
  "flex items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-border-subtle bg-bg-overlay px-3 py-2.5 transition-colors duration-150";

export const permissionInfoClass = "grid gap-0.5";

export const permissionLabelClass =
  "text-[13px] font-semibold leading-snug text-fg";

export const permissionDescriptionClass =
  "text-[11px] font-medium leading-[1.45] text-fg-muted";

export const permissionStateClass =
  "flex shrink-0 items-center gap-1.5 text-[11px] font-medium [&_svg]:h-3 [&_svg]:w-3";

export const statusDotClass =
  "inline-block h-2 w-2 shrink-0 rounded-[var(--radius-0)]";

export const wizardPageClass =
  "flex min-h-screen items-center justify-center bg-bg px-4 py-8";

export const wizardCardClass =
  "w-full max-w-[480px] rounded-[var(--radius-0)] border border-border bg-bg-elevated p-6";

export const wizardHeaderClass = "mb-5 text-center";

export const wizardTitleClass =
  "m-0 text-base font-semibold leading-snug text-fg";

export const wizardStepLabelClass =
  "mt-1 mb-0 text-[11px] font-medium leading-[1.45] text-fg-muted";

export const wizardBodyClass = "mb-5";

export const wizardFooterClass = "flex justify-center gap-2";

export const progressDotsClass =
  "mt-3 flex items-center justify-center gap-1.5";

export const progressDotClass =
  "h-1.5 w-1.5 rounded-[var(--radius-0)] bg-border-strong transition-[background-color,width] duration-150";

export const calendarComingSoonClass =
  "inline-flex items-center gap-1 rounded-[var(--radius-1)] border border-border-subtle bg-bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-fg-muted";

export const calendarPlaceholderClass =
  "grid gap-3 py-2 text-center [&_p]:m-0 [&_p]:text-xs [&_p]:font-medium [&_p]:leading-normal [&_p]:text-fg-muted [&_svg]:mx-auto [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-fg-subtle";

export const desktopShellClass = "mx-auto grid w-full gap-4 pb-8";

export const formPanelClass = cx(panelClass, "w-full max-w-[640px]");

export const dashboardGridClass =
  "grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]";

export const choiceCardClass =
  "cursor-pointer rounded-[var(--radius-0)] border border-border bg-bg-elevated p-4 transition-colors duration-150 hover:border-border-strong hover:bg-bg-subtle";

export const cardTitleClass = "mt-0 mb-1 text-[13px] font-semibold text-fg";

export const cardTextClass =
  "m-0 text-xs font-medium leading-normal text-fg-muted";

export const inviteListClass =
  "mt-2 grid list-none gap-0 border border-border-subtle p-0";

export const inviteRowClass =
  "flex items-start justify-between gap-3 border-border-subtle border-b px-3 py-2.5 last:border-b-0";

export const tabsPanelClass = cx(panelClass, "grid gap-3");

export const tabsRowClass = "flex gap-0 border-border border-b";

export const tabButtonClass =
  "relative mb-[-1px] h-auto rounded-none border-0 border-b border-transparent bg-transparent px-3 py-2 text-xs font-medium text-fg-muted hover:not-disabled:bg-transparent hover:not-disabled:text-fg";

export const tabActiveClass =
  "border-accent text-fg hover:not-disabled:bg-transparent hover:not-disabled:text-fg";

export const activeListClass = "grid gap-2.5";

export const sessionRowClass =
  "flex items-center justify-between gap-3 rounded-[var(--radius-0)] border border-border-subtle bg-bg-subtle p-3 [&_h3]:mt-0 [&_h3]:mb-1 [&_h3]:text-[13px] [&_h3]:font-semibold";

export const statsGridClass =
  "grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]";

export const preClass =
  "m-0 overflow-x-auto rounded-[var(--radius-0)] border border-border-subtle bg-bg-emphasis p-3 font-mono text-xs text-fg";

export const codeClass =
  "inline-block rounded-[var(--radius-1)] bg-bg-emphasis px-1.5 py-0.5 font-mono text-[11px] font-medium text-fg";

export const warningBannerClass =
  "rounded-[var(--radius-0)] border border-warning-fg bg-warning-bg p-3 text-xs font-medium text-warning-fg";

// Home screen
export const startMeetingModeClass =
  "rounded-[var(--radius-panel)] border border-border bg-bg-elevated p-4 transition-all duration-150 ease-out";

export const homeGridClass = "grid gap-3 md:grid-cols-[1fr_1.2fr]";

export const healthStripClass =
  "flex items-center gap-2 rounded-[var(--radius-panel)] border border-border bg-bg-overlay px-3.5 py-2";

export function metricChipClass(
  variant: "success" | "warning" | "muted" = "muted"
): string {
  const base =
    "inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-[10px] font-medium leading-snug tracking-wide uppercase";
  const variants: Record<string, string> = {
    success: `${base} border-success bg-success-bg text-success`,
    warning: `${base} border-warning bg-warning-bg text-warning`,
    muted: `${base} border-border bg-bg-overlay text-fg-muted`,
  };
  return variants[variant] ?? variants.muted ?? "";
}
