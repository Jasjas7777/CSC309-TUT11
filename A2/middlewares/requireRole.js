
//Clearance middleware
module.exports = function requireRole(...allowedRoles) {
    return (req, res, next) => {
        const user = req.user;
        if (!allowedRoles.includes(user.role.toLowerCase())){
            return res.status(403).json({'error': "Unauthorized"});
        }
        next();
    };
}