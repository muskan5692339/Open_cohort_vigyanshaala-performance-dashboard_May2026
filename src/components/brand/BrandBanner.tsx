import type { ReactNode } from 'react';
import './BrandBanner.css';

interface Props {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  className?: string;
}

export default function BrandBanner({ title, subtitle, trailing, className }: Props) {
  return (
    <div className={className ? `brand-banner ${className}` : 'brand-banner'}>
      <img className="brand-banner__logo" src="/vigyanshaala-logo.jpg" alt="VigyanShaala" />
      <div className="brand-banner__text">
        <div className="brand-banner__title">{title}</div>
        {subtitle ? <div className="brand-banner__subtitle">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="brand-banner__trailing">{trailing}</div> : null}
    </div>
  );
}
