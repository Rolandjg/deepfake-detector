import Image from "next/image";
import { useState } from "react";

type Props = {
  title: string;
  description: string;
  filePrefix: string;
};

const Reference = ({ title, description, filePrefix }: Props) => {
  const [isShown, setShown] = useState(false);

  const items = [
    {
      title: "Original Image",
      href: `/examples/${filePrefix}.jpg`,
      src: `/examples/${filePrefix}.jpg`,
      alt: "original image",
    },
    {
      title: "Noise Residual",
      href: `/examples/nr/${filePrefix}.jpg`,
      src: `/examples/nr/${filePrefix}.jpg`,
      alt: "noise residual",
    },
    {
      title: "Noise Residual FFT",
      href: `/examples/fft/${filePrefix}.jpg`,
      src: `/examples/fft/${filePrefix}.jpg`,
      alt: "noise residual fft",
    },
    {
      title: "Local Noise Variance",
      href: `/examples/lnv/${filePrefix}.jpg`,
      src: `/examples/lnv/${filePrefix}.jpg`,
      alt: "local noise variance",
    },
    {
      title: "Luminance Gradient (Sobel)",
      href: `/examples/sobel/${filePrefix}.jpg`,
      src: `/examples/sobel/${filePrefix}.jpg`,
      alt: "luminance gradient sobel",
    },
    {
      title: "PCA Minor Component (PC3)",
      href: `/examples/pc3/${filePrefix}.jpg`,
      src: `/examples/pc3/${filePrefix}.jpg`,
      alt: "pca minor component pc3",
    },
    {
      title: "Block Artifact Grid",
      href: `/examples/bag/${filePrefix}.jpg`,
      src: `/examples/bag/${filePrefix}.jpg`,
      alt: "block artifact grid",
    },
    {
      title: "Error Level Analysis (ELA)",
      href: `/examples/ela/${filePrefix}.jpg`,
      src: `/examples/ela/${filePrefix}.jpg`,
      alt: "error level analysis",
    },
  ];

  return (
    <div className="w-full">
      <div
        onClick={() => setShown(!isShown)}
        className="cursor-pointer"
      >
        <h2
          className={`mb-3 text-center text-xl font-bold transition-colors ${
            isShown ? "text-slate-800" : "text-slate-400 hover:text-slate-700"
          }`}
        >
          {title}
        </h2>

        {isShown && (
          <p className="mx-auto my-2 max-w-3xl text-center text-md">
            {description}
          </p>
        )}
      </div>

      {isShown && (
        <div className="mx-auto mt-6 w-full max-w-7xl px-2 sm:px-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
              <div
                key={item.title}
                className="rounded-sm border border-slate-200 bg-slate-50 p-3"
              >
                <h4 className="p-2 text-center text-lg font-bold text-slate-800">
                  {item.title}
                </h4>

                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Image
                    className="h-auto w-full rounded-md object-cover"
                    src={item.src}
                    alt={item.alt}
                    width={400}
                    height={400}
                  />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reference;
