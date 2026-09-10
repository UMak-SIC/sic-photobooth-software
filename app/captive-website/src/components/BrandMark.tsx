import Image from 'next/image';

export function BrandMark() {
  return (
    <Image
      src="/sic-logo.png"
      alt="Society of Innovative Computing"
      width={48}
      height={48}
      className="size-10 object-contain"
      priority
    />
  );
}
