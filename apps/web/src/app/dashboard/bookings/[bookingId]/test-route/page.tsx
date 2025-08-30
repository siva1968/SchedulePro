export default function TestPage({ params }: { params: { bookingId: string } }) {
  return (
    <div className="p-8">
      <h1>Test Page</h1>
      <p>Booking ID from URL: {params.bookingId}</p>
    </div>
  );
}
