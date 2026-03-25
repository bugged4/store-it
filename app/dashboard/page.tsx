import FileUpload from "@/components/ui/fileupload";

export default function UploadPage() {


  
  return (
    <main className="upload-page">
      <div className="upload-page-inner">
        <div className="upload-header">
          <h1 className="upload-title">Upload a File</h1>
          <p className="upload-desc">
            Store and manage your files securely. Drag and drop or browse to get started.
          </p>
        </div>

        <FileUpload />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

        .upload-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f9fafb;
          font-family: 'DM Sans', sans-serif;
          padding: 24px;
        }
        .upload-page-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          width: 100%;
        }
        .upload-header {
          text-align: center;
          max-width: 420px;
        }
        .upload-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }
        .upload-desc {
          font-size: 0.95rem;
          color: #6b7280;
          margin: 0;
          line-height: 1.6;
        }
      `}</style>
    </main>
  );
}
