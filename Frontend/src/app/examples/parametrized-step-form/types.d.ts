
interface Form {
    name: string,
    fields: string[]
  }
  
interface FormLayout {
    name: string
    forms: Form[]
}

interface cfg {
    certificates: FormLayout[]
}