export interface WaybillData {
  /** «حقیقی» یا «حقوقی» — پیش‌فرض حقوقی */
  senderType?: string
  /** نام شرکت — فقط وقتی نوع «حقوقی» است */
  senderOfficeName?: string
  senderFirstName: string
  senderLastName: string
  senderMobile: string
  senderPhone?: string
  senderNationalId: string
  senderPostalCode?: string

  receiverType?: string
  receiverFirstName: string
  receiverLastName: string
  receiverMobile: string
  receiverPhone?: string
  receiverNationalId: string
  receiverPostalCode?: string

  plateNumber: string
  vehicleSerialNumber?: string
  vehicleMotorNumber?: string
  vehicleInsurancePage?: string
  vehicleSparePlate?: string
  vehicleType?: string

  accountName?: string
  driverName: string
  driverMobile?: string
  driverNationalId?: string
  driverLicense?: string
  driverCard?: string
  driverIdNumber?: string
  driverGender?: string

  cargoName: string
  cargoPackaging?: string
  cargoWeight?: string
  cargoQuantity?: string

  originProvince?: string
  originCity?: string
  destProvince?: string
  destCity?: string

  advanceFare?: string
  fareType?: string
  freightCost?: string
  transportInsurance?: string
  totalAmount?: string
  insuranceRate?: string
  insuranceAmount?: string

  captchaAnswer?: string
}
