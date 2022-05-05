
interface Form {
    name: string
  }
  
interface FormLayout {
    name: string
    forms: Form[]
}

interface cfg {
    certificates: FormLayout[]
}