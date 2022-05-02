var express = require('express');
var app = express();

// Add headers
app.use(function (req, res, next) {

   // Website you wish to allow to connect
   res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');

   // Request methods you wish to allow
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

   // Request headers you wish to allow
   res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

   // Set to true if you need the website to include cookies in the requests sent
   // to the API (e.g. in case you use sessions)
   res.setHeader('Access-Control-Allow-Credentials', true);

   // Pass to next layer of middleware
   next();
});


app.get('/api/client/1/order/:orderId/doc/representative', function (req, res) {
   arr = [
      {
         id: "123",
          name: "Jose Manuel Antunes Andrade",
          fileName: "",
          status: "Por submeter",
          isAuthenticated: false
      }, 
      {
         id: "654",
         name: "Maria Oliveira",
         fileName: "maria.pdf",
         status: "Validado",
         isAuthenticated: true
     }
  ];

   response = getById(arr, req.params.orderId)

   res.end(JSON.stringify(response));
})


app.get('/api/client/1/order/:orderId/doc/entity-responsable', function (req, res) {
   arr = [
      {
         id: "123",
         name: "Rui Ramos Silva Lopes",
         fileName: "Rui_Ramos_Silva_Lopes.pdf",
         status: "Em analise",
         isAuthenticated: true
     },     
     {
         id: "123",        
         name: "Paulo Pires",
         fileName: "Paulo_Pires.pdf",
         status: "asd",
         isAuthenticated: false
     },     
     {
         id: "123",        
         name: "João Cunha da Silva",
         fileName: "",
         status: "Por submeter",
         isAuthenticated: false
     },     
     { 
         id: "123",        
         name: "Dunha Silva",
         fileName: "Dunha_Silva.pdf",
         status: "Por submeter",
         isAuthenticated: true
     }
  ];

   response = getById(arr, req.params.orderId)

   res.end(JSON.stringify(response));
})


const getById = (arr, id) => {
   return arr.filter(elem => elem.id === id);
};

var server = app.listen(8081, function () {
   var host = server.address().address
   var port = server.address().port
   
   console.log(`Example app listening at http://${host}:${port}`)
})