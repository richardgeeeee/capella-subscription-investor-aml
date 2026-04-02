export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          奕卓資本 / Capella Alpha Fund
        </h1>
        <h2 className="text-lg text-gray-600 mb-6">
          投资者信息收集系统 / Investor Information Collection
        </h2>
        <div className="p-4 bg-blue-50 rounded-lg">
          <p className="text-gray-700">
            请使用您收到的专属链接访问表单。
          </p>
          <p className="text-gray-500 mt-2 text-sm">
            Please use the unique link you received to access the submission form.
          </p>
        </div>
        <div className="mt-6 pt-6 border-t">
          <a href="/admin/login" className="text-sm text-gray-400 hover:text-gray-600">
            管理员登录 / Admin Login
          </a>
        </div>
      </div>
    </div>
  );
}
