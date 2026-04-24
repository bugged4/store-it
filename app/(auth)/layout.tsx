import Image from "next/image";

const AuthLayout=({children}:{children:React.ReactNode})=>{
const imgheight1="h-[100px]"
const imgwidth1="w-[100px]"

    return (
        <div
        className="flex min-h-screen "
        >
        <section className="bg-brand p-10 ">

      <div className="transition-transform duration-500 hover:rotate-5 hover:scale-105">
 
</div>

      
    
    <div className="transition-transform hover:rotate-2 duration-300">
         <Image
      src="/logo.png"
      alt="logo"
      width={100}
      height={100}
    
      
      />
  </div>
        </section>

        <section>
        <div className="space-y-5 text-white">
            <h1>manage files</h1>
            <p className="body-1">Organize and manage your files efficiently.</p>
        </div>
          {children}
        </section>
        
        </div>
    )
}
export default AuthLayout;