export default function ExpiredPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          链接已过期 / Link Expired
        </h1>
        <p className="text-gray-600">
          此提交链接已过期。请联系奕卓資本获取新链接。
        </p>
        <p className="text-gray-500 mt-2">
          This submission link has expired. Please contact Capella Capital for a new link.
        </p>
      </div>
    </div>
  );
}
