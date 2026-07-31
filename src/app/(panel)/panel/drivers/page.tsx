import DbCrud from '@/components/shared/DbCrud'
export default function DriversPage() {
  return <DbCrud title="رانندگان" subtitle="مدیریت اطلاعات رانندگان" apiBase="/api/drivers"
    fields={[
      { key: 'name', label: 'نام', required: true },
      { key: 'nationalId', label: 'کد ملی', required: true },
      { key: 'phone', label: 'تلفن', required: true },
      { key: 'license', label: 'گواهینامه', required: true },
      { key: 'driverCard', label: 'کارت راننده' },
      { key: 'password', label: 'رمز عبور سامانه' },
      { key: 'dailyTarget', label: 'هدف روزانه' },
    ]}
    columns={[
      { key: 'name', label: 'نام' },
      { key: 'nationalId', label: 'کد ملی' },
      { key: 'phone', label: 'تلفن' },
      { key: 'license', label: 'گواهینامه' },
      { key: 'dailyTarget', label: 'هدف روزانه' },
    ]}
    searchKeys={['name', 'nationalId', 'phone']}
  />
}
