import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username : {type : String, required : true},
    email : {type : String, required: true, unique : true},
    password : {type : String, required : true},
    isVerified : {type:Boolean, default : false},
    joined : {type : Date, default : Date.now},

    shopeeApiKey : {type : String},

    role : {
        type : String,
        required : true,
        enum : ["Admin", "User"],
        default : "User"
    },

    //for user ttl
    // createdAt: { type: Date, default: Date.now }
})

const User = mongoose.model("User", userSchema)
export default User