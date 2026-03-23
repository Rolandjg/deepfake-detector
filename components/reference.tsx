import Image from "next/image";
import { useState } from "react";

type props = {
  title: string,
  description: string,
  filePrefix: string,
}

const Reference = ({ title, description, filePrefix }: props) => {
  const [isShown, setShown] = useState(false);

  return (
    <>
      <div onClick={() => setShown(!isShown)} className="cursor-pointer">
        <h2 className={`font-bold text-xl mb-3 text-center ${!isShown ? `text-gray-500` : `text-white`}`}>{title}</h2>
        {isShown && <p className="text-md my-2 text-center">{description}</p> }
      </div>
      {isShown && 
      <div className="md:flex justify-center w-full mx-auto items-center gap-3">
        <div className="bg-gray-800 rounded-md border-1 border-gray-700/50 p-3 font-bold">
          <h4 className="text-lg p-2 text-center">Original Image</h4>
          <a href={`/examples/${filePrefix}.jpg`} target="_blank">
            <Image className="rounded-md" src={`/examples/${filePrefix}.jpg`} alt="original" height={800} width={800}/>
          </a>
        </div>
        <div className="bg-gray-800 rounded-md border-1 border-gray-700/50 p-3 font-bold">
          <h4 className="text-lg p-2 text-center">Noise Residual</h4>
          <a href={`/examples/nr-${filePrefix}.jpg`} target="_blank">
            <Image className="rounded-md" src={`/examples/nr-${filePrefix}.jpg`} alt="noise residual" height={800} width={800}/>
          </a>
        </div>
        <div className="bg-gray-800 rounded-md border-1 border-gray-700/50 p-3 font-bold">
          <h4 className="text-lg p-2 text-center">Noise Residual FFT</h4>
          <a href={`/examples/fft-${filePrefix}.jpg`}target="_blank">
            <Image className="rounded-md" src={`/examples/fft-${filePrefix}.jpg`} alt="noise residual fft" height={800} width={800}/>
          </a>
        </div>
      </div>
      
      }
    </>
  )
}

export default Reference;
