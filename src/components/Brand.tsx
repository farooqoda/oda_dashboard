/** Impact Connect logo: the Impact Innovation Hub mark + the wordmark in the logo's face and colours. */
export function BrandLogo({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const mark = size === 'lg' ? 'h-14' : 'h-10';
  const text = size === 'lg' ? 'text-[1.4rem]' : 'text-[1.05rem]';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/brand/mark.png" alt="" className={`${mark} w-auto dark:hidden`} />
      <img src="/brand/mark-dark.png" alt="" className={`${mark} hidden w-auto dark:block`} />
      <span className={`font-display font-extrabold uppercase leading-[0.95] tracking-[0.01em] ${text}`}>
        <span className="block text-[#0e2850] dark:text-[#ffffff]">Impact</span>
        <span className="block text-[#05a3aa] dark:text-[#2bc4ca]">Connect</span>
      </span>
    </span>
  );
}
