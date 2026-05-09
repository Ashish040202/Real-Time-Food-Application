import Link from 'next/link';

export default function Home() {
  const routes = [
    {
      title: 'Sell Orders',
      description: 'View and manage all sell orders',
      href: '/sell-orders',
      color: 'bg-blue-500 hover:bg-blue-600',
    },
    {
      title: 'New Orders',
      description: 'Create new orders for customers',
      href: '/new-orders',
      color: 'bg-green-500 hover: bg-green-600',
    },
    {
      title:  'View Orders',
      description: 'Browse all orders with filtering options',
      href: '/view-orders',
      color: 'bg-purple-500 hover: bg-purple-600',
    },
    {
      title:  'Live Orders',
      description: 'Browse all live orders',
      href: '/live-orders',
      color: 'bg-purple-500 hover: bg-purple-600',
    }
  ];

  return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Food Orders Management
          </h1>
          <p className="text-lg text-gray-600">
            Powered by Next.js and Apollo GraphQL
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {routes.map((route) => (
              <Link
                  key={route.href}
                  href={route.href}
                  className={`${route.color} text-white rounded-lg shadow-lg p-8 transform transition-all hover:scale-105`}
              >
                <h2 className="text-2xl font-bold mb-4">{route.title}</h2>
                <p className="text-white/90">{route.description}</p>
              </Link>
          ))}
        </div>
      </div>
  );
}